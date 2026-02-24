import type { IOSAudioHandler } from '../types';

type EventCallback = () => void;

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private listeners = new Map<string, EventCallback[]>();
  private streamTimeout: ReturnType<typeof setTimeout> | null = null;
  private isIOS: boolean;
  private iosHandler: IOSAudioHandler | null;
  private nextStartTime: number = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private scheduleInterval: ReturnType<typeof setInterval> | null = null;
  private readonly SCHEDULE_AHEAD_TIME = 0.3;

  constructor() {
    this.isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.iosHandler = window.iosAudioHandler || null;

    if (this.isIOS && this.iosHandler) {
      console.log('[AudioPlayer] Using iOS audio workarounds for playback');
    }
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  private emit(event: string): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback());
    }
  }

  async initialize(): Promise<void> {
    try {
      this.audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      console.log(
        'Audio player initialized with sample rate:',
        this.audioContext.sampleRate
      );
    } catch (error) {
      console.error('Failed to initialize audio player:', error);
      throw error;
    }
  }

  async addAudioStream(
    base64Audio: string,
    sampleRate: number = 16000,
    isLastChunk: boolean = false,
    audioFormat: 'int16' | 'float32' = 'int16'
  ): Promise<void> {
    if (!base64Audio || base64Audio.length === 0) {
      console.warn('Empty audio data received');
      return;
    }

    if (this.streamTimeout) {
      clearTimeout(this.streamTimeout);
    }

    this.streamTimeout = setTimeout(() => {
      this.endStreaming();
    }, 1000);

    // Use iOS handler if available
    if (this.isIOS && this.iosHandler) {
      try {
        await this.iosHandler.playAudioChunk?.(base64Audio, isLastChunk);
        if (!this.isPlaying) {
          this.isPlaying = true;
          this.emit('playback_started');
        }
        return;
      } catch (error) {
        console.error(
          '[AudioPlayer] iOS playback failed, falling back to standard:',
          error
        );
      }
    }

    // Standard implementation
    if (!this.audioContext) {
      await this.initialize();
    }

    try {
      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.createAudioBuffer(
        bytes.buffer,
        sampleRate,
        audioFormat
      );

      this.audioQueue.push(audioBuffer);

      if (!this.isPlaying) {
        this.startScheduleInterval();
        this.scheduleBuffers();
      }
    } catch (error) {
      console.error('Error processing audio stream:', error);
    }
  }

  private async createAudioBuffer(
    arrayBuffer: ArrayBuffer,
    sampleRate: number,
    audioFormat: 'int16' | 'float32' = 'int16'
  ): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    let numSamples: number;

    if (audioFormat === 'float32') {
      const float32Array = new Float32Array(arrayBuffer);
      numSamples = float32Array.length;

      const audioBuffer = this.audioContext.createBuffer(
        1,
        numSamples,
        sampleRate
      );
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < numSamples; i++) {
        channelData[i] = float32Array[i];
      }

      return audioBuffer;
    } else {
      // Int16 PCM format
      const int16Array = new Int16Array(arrayBuffer);
      numSamples = int16Array.length;

      const audioBuffer = this.audioContext.createBuffer(
        1,
        numSamples,
        sampleRate
      );
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < numSamples; i++) {
        channelData[i] = int16Array[i] / 32768.0;
      }

      return audioBuffer;
    }
  }

  private scheduleBuffers(): void {
    if (!this.audioContext || this.audioQueue.length === 0) {
      return;
    }

    const currentTime = this.audioContext.currentTime;

    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    // Schedule buffers that should start within SCHEDULE_AHEAD_TIME
    while (
      this.audioQueue.length > 0 &&
      this.nextStartTime < currentTime + this.SCHEDULE_AHEAD_TIME
    ) {
      const audioBuffer = this.audioQueue.shift()!;
      this.scheduleBuffer(audioBuffer, this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }
  }

  private scheduleBuffer(audioBuffer: AudioBuffer, startTime: number): void {
    if (!this.audioContext) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    this.scheduledSources.push(source);

    source.onended = () => {
      const index = this.scheduledSources.indexOf(source);
      if (index > -1) {
        this.scheduledSources.splice(index, 1);
      }

      // Backstop: ensure more buffers get scheduled even if setInterval is delayed
      this.scheduleBuffers();

      if (this.scheduledSources.length === 0 && this.audioQueue.length === 0) {
        this.isPlaying = false;
        this.stopScheduleInterval();
        this.emit('playback_finished');
      }
    };

    try {
      source.start(startTime);

      if (!this.isPlaying) {
        this.isPlaying = true;
        this.emit('playback_started');
      }
    } catch (error) {
      console.error('Error scheduling audio buffer:', error);
      const index = this.scheduledSources.indexOf(source);
      if (index > -1) {
        this.scheduledSources.splice(index, 1);
      }
    }
  }

  private startScheduleInterval(): void {
    if (this.scheduleInterval) return;
    this.scheduleInterval = setInterval(() => {
      this.scheduleBuffers();
    }, 50);
  }

  private stopScheduleInterval(): void {
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = null;
    }
  }

  stop(): void {
    // Clear stream timeout
    if (this.streamTimeout) {
      clearTimeout(this.streamTimeout);
      this.streamTimeout = null;
    }

    // Use iOS handler if available
    if (this.isIOS && this.iosHandler) {
      this.iosHandler.stopAudioPlayback?.();
      this.isPlaying = false;
      this.emit('playback_stopped');
      return;
    }

    // Standard implementation
    this.stopScheduleInterval();

    // Stop all scheduled sources
    for (const source of this.scheduledSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may have already ended
      }
    }
    this.scheduledSources = [];
    this.nextStartTime = 0;

    this.audioQueue = [];
    this.isPlaying = false;
    this.emit('playback_stopped');
  }

  destroy(): void {
    this.stop();
    this.stopScheduleInterval();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.listeners.clear();
  }

  private endStreaming(): void {
    console.log('[AudioPlayer] Stream ended, finalizing audio playback');

    if (this.streamTimeout) {
      clearTimeout(this.streamTimeout);
      this.streamTimeout = null;
    }

    if (this.isIOS && this.iosHandler) {
      this.iosHandler.playAudioChunk?.('', true);
    }
  }

  markStreamComplete(): void {
    console.log('[AudioPlayer] Stream marked as complete by backend');
    this.endStreaming();
  }

  getQueueLength(): number {
    return this.audioQueue.length;
  }

  isPlaybackActive(): boolean {
    return this.isPlaying;
  }
}
