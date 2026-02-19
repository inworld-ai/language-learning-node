import type { IOSAudioHandler } from '../types';

type EventCallback = () => void;

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private isStartingPlayback = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private listeners = new Map<string, EventCallback[]>();
  private streamTimeout: ReturnType<typeof setTimeout> | null = null;
  private isIOS: boolean;
  private iosHandler: IOSAudioHandler | null;
  private nextStartTime: number = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private scheduleInterval: ReturnType<typeof setInterval> | null = null;
  private readonly SCHEDULE_AHEAD_TIME = 0.1; // Look 100ms ahead
  private readonly FADE_SAMPLES = 128; // ~2.7ms at 48kHz, ~8ms at 16kHz

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

      // Create audio buffer
      const audioBuffer = await this.createAudioBuffer(
        bytes.buffer,
        sampleRate,
        audioFormat
      );
      this.applyFadeEnvelope(audioBuffer);

      this.audioQueue.push(audioBuffer);

      // Start playback immediately if not already playing
      if (!this.isPlaying && !this.isStartingPlayback) {
        this.isStartingPlayback = true;
        this.startScheduleInterval();
        requestAnimationFrame(() => {
          this.isStartingPlayback = false;
          this.scheduleBuffers();
        });
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

    console.log(
      `[AudioPlayer] createAudioBuffer: format=${audioFormat}, byteLength=${arrayBuffer.byteLength}, sampleRate=${sampleRate}`
    );

    if (audioFormat === 'float32') {
      const float32Array = new Float32Array(arrayBuffer);
      numSamples = float32Array.length;
      console.log(
        `[AudioPlayer] Float32 samples: ${numSamples}, first 3 values: [${Array.from(
          float32Array.slice(0, 3)
        )
          .map((v) => v.toFixed(4))
          .join(', ')}]`
      );

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
      console.log(`[AudioPlayer] Int16 samples: ${numSamples}`);

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

  private applyFadeEnvelope(audioBuffer: AudioBuffer): void {
    const channelData = audioBuffer.getChannelData(0);
    const length = channelData.length;
    const fadeLength = Math.min(this.FADE_SAMPLES, Math.floor(length / 4));

    // Fade-in at start
    for (let i = 0; i < fadeLength; i++) {
      const gain = i / fadeLength;
      channelData[i] *= gain;
    }

    // Fade-out at end
    for (let i = 0; i < fadeLength; i++) {
      const gain = i / fadeLength;
      channelData[length - 1 - i] *= gain;
    }
  }

  private scheduleBuffers(): void {
    if (!this.audioContext || this.audioQueue.length === 0) {
      return;
    }

    const currentTime = this.audioContext.currentTime;

    // Handle queue underrun with safety margin
    if (this.nextStartTime < currentTime) {
      const underrunAmount = currentTime - this.nextStartTime;
      if (underrunAmount > 0.05) {
        console.warn(
          `[AudioPlayer] Queue underrun: ${(underrunAmount * 1000).toFixed(1)}ms behind`
        );
      }
      // Add small margin to ensure we're not scheduling in the past
      this.nextStartTime = currentTime + 0.005;
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

      if (this.scheduledSources.length === 0 && this.audioQueue.length === 0) {
        this.isPlaying = false;
        this.stopScheduleInterval();
        this.emit('playback_finished');
      }
    };

    try {
      source.start(startTime);
      console.log(
        `Scheduled buffer: ${audioBuffer.duration.toFixed(3)}s at ${startTime.toFixed(3)}`
      );

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
      this.isStartingPlayback = false;
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

    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
        this.currentSource = null;
      } catch (error) {
        console.warn('Error stopping audio source:', error);
      }
    }

    // Clear audio queue to prevent any queued audio from playing
    this.audioQueue = [];
    this.isPlaying = false;
    this.isStartingPlayback = false;
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
