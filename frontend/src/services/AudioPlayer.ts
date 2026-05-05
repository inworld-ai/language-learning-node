import type { IOSAudioHandler } from '../types';
import type { AudioPipeline } from './AudioPipeline';

type EventCallback = () => void;

export class AudioPlayer {
  private pipeline: AudioPipeline | null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
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
  private readonly SCHEDULE_AHEAD_TIME = 0.1;
  /** Was 15ms. 25ms preserves the click-free fade while letting Chrome's AEC
   *  re-converge faster on user interrupt — a non-zero reference signal during
   *  a long fade distorts the mic input. */
  private readonly FADE_DURATION = 0.025;

  constructor(pipeline?: AudioPipeline) {
    this.pipeline = pipeline ?? null;
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

  async initialize(_sampleRate?: number): Promise<void> {
    try {
      if (this.pipeline && !this.isIOS) {
        // Share the pipeline's playback context so all audio routes through one
        // master output node — required for the WebRTC loopback AEC to see a
        // unified reference signal.
        this.audioContext = this.pipeline.getPlaybackContext();
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0;
        this.gainNode.connect(this.pipeline.getOutputNode());
        return;
      }

      // iOS / no-pipeline fallback: each player owns its own context.
      this.audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.audioContext.destination);
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
      return;
    }

    if (this.streamTimeout) {
      clearTimeout(this.streamTimeout);
    }

    this.streamTimeout = setTimeout(() => {
      this.endStreaming();
    }, 1000);

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

    if (!this.audioContext || !this.gainNode) {
      await this.initialize(sampleRate);
    }

    try {
      const binaryString = atob(base64Audio);
      let bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Strip WAV header if present — Inworld may include a 44-byte RIFF/WAV
      // header on each audio chunk. Interpreting it as PCM samples causes clicks.
      if (
        bytes.length > 44 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46
      ) {
        bytes = bytes.slice(44);
      }

      const audioBuffer = await this.createAudioBuffer(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ),
        sampleRate,
        audioFormat
      );

      this.audioQueue.push(audioBuffer);

      if (!this.isPlaying && !this.isStartingPlayback) {
        this.isStartingPlayback = true;
        this.fadeIn();
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

  /** Fade gain from 0 → 1 over FADE_DURATION */
  private fadeIn(): void {
    if (!this.audioContext || !this.gainNode) return;
    const now = this.audioContext.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(1, now + this.FADE_DURATION);
  }

  /** Fade gain from current → 0 over FADE_DURATION, then call callback */
  private fadeOut(callback?: () => void): void {
    if (!this.audioContext || !this.gainNode) {
      callback?.();
      return;
    }
    const now = this.audioContext.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(0, now + this.FADE_DURATION);

    if (callback) {
      setTimeout(callback, this.FADE_DURATION * 1000 + 5);
    }
  }

  private scheduleBuffers(): void {
    if (!this.audioContext || this.audioQueue.length === 0) {
      return;
    }

    const currentTime = this.audioContext.currentTime;

    // Handle queue underrun — schedule immediately, no gap.
    // Adding a margin (e.g. 5ms) introduces an audible click at the boundary.
    // Reference: Inworld Studio uses Math.max(nextPlayTime, ctx.currentTime).
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

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
    if (!this.audioContext || !this.gainNode) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    this.scheduledSources.push(source);

    source.onended = () => {
      const index = this.scheduledSources.indexOf(source);
      if (index > -1) {
        this.scheduledSources.splice(index, 1);
      }

      if (this.scheduledSources.length === 0 && this.audioQueue.length === 0) {
        this.fadeOut(() => {
          this.isPlaying = false;
          this.stopScheduleInterval();
          this.emit('playback_finished');
        });
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

  /** Signal that no more audio chunks will arrive for this stream */
  markStreamComplete(): void {
    this.endStreaming();
  }

  stop(): void {
    this.stopInternal(false);
  }

  /** Stop immediately with no fade — used for user interruption */
  stopImmediate(): void {
    this.stopInternal(true);
  }

  private stopInternal(immediate: boolean): void {
    if (this.streamTimeout) {
      clearTimeout(this.streamTimeout);
      this.streamTimeout = null;
    }

    if (this.isIOS && this.iosHandler) {
      this.iosHandler.stopAudioPlayback?.();
      this.isPlaying = false;
      this.isStartingPlayback = false;
      this.emit('playback_stopped');
      return;
    }

    const killSources = () => {
      this.stopScheduleInterval();

      for (const source of this.scheduledSources) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          /* already stopped */
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

      this.audioQueue = [];
      this.isPlaying = false;
      this.isStartingPlayback = false;
      this.emit('playback_stopped');
    };

    if (immediate) {
      if (this.gainNode && this.audioContext) {
        this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      }
      killSources();
    } else {
      this.fadeOut(killSources);
    }
  }

  destroy(): void {
    this.stop();
    this.stopScheduleInterval();

    // Disconnect our gain node, but only close the context if we own it.
    // When using a shared AudioPipeline, the pipeline owns the context and
    // closing it here would break the other AudioPlayer.
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        /* not connected */
      }
      this.gainNode = null;
    }
    if (this.audioContext && !this.pipeline) {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;

    this.listeners.clear();
  }

  private endStreaming(): void {
    if (this.streamTimeout) {
      clearTimeout(this.streamTimeout);
      this.streamTimeout = null;
    }

    if (this.scheduledSources.length === 0 && this.audioQueue.length === 0) {
      if (this.isPlaying) {
        this.fadeOut(() => {
          this.isPlaying = false;
          this.stopScheduleInterval();
          this.emit('playback_finished');
        });
      }
    }
  }
}
