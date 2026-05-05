import type { IOSAudioHandler } from '../types';
import type { AudioPipeline } from './AudioPipeline';

type EventCallback = (data: string) => void;

const CAPTURE_SAMPLE_RATE = 24000;

/** getUserMedia constraints with the optional Chrome-only AEC hint. */
type MicConstraints = MediaTrackConstraints & {
  suppressLocalAudioPlayback?: { ideal: boolean };
};

export class AudioHandler {
  private pipeline: AudioPipeline | null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private recordSourceNode: MediaStreamAudioSourceNode | null = null;
  private isStreaming = false;
  private listeners = new Map<string, EventCallback[]>();
  private isIOS: boolean;
  private iosHandler: IOSAudioHandler | null;

  constructor(pipeline?: AudioPipeline) {
    this.pipeline = pipeline ?? null;
    this.isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.iosHandler = window.iosAudioHandler || null;

    if (this.isIOS && this.iosHandler) {
      console.log('[AudioHandler] Using iOS audio workarounds');
      this.setupIOSEventListeners();
    }
  }

  private setupIOSEventListeners(): void {
    window.addEventListener('ios-audio-unlocked', ((event: CustomEvent) => {
      console.log('[AudioHandler] iOS audio unlocked');
      this.audioContext = event.detail.audioContext;
    }) as EventListener);

    window.addEventListener('ios-audio-error', ((event: CustomEvent) => {
      console.error('[AudioHandler] iOS audio error:', event.detail.message);
      this.emit('error', event.detail);
    }) as EventListener);

    window.addEventListener('ios-audio-ended', () => {
      console.log('[AudioHandler] iOS audio playback ended');
      this.emit('playback_finished', '');
    });
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  clearAllListeners(): void {
    this.listeners.clear();
  }

  private emit(event: string, data: string): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  async startStreaming(): Promise<void> {
    try {
      console.log('Starting continuous audio streaming...');

      // iOS path is unchanged — its native handler manages mic + AEC.
      if (this.isIOS && this.iosHandler) {
        console.log('[AudioHandler] Using iOS audio handler for microphone');

        await this.iosHandler.unlockAudioContext?.();

        const success = await this.iosHandler.startMicrophone?.((audioData) => {
          if (this.isStreaming) {
            this.emit('audioChunk', audioData);
          }
        });

        if (success) {
          this.isStreaming = true;
          console.log('[AudioHandler] iOS microphone started successfully');
          return;
        }
      }

      const useLoopback = !!this.pipeline;
      const constraints: MicConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: CAPTURE_SAMPLE_RATE,
      };
      if (useLoopback) {
        // Chrome-only hint: tells the browser to NOT apply its built-in playback
        // suppression so our WebRTC loopback can deliver an explicit reference
        // signal to the AEC. No-op on browsers that don't recognize it.
        constraints.suppressLocalAudioPlayback = { ideal: true };
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints,
      });
      console.log('Microphone access granted for continuous streaming');

      // Capture AudioContext at 24kHz: matches our target rate so the worklet
      // doesn't have to resample on every render quantum.
      this.audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )({ sampleRate: CAPTURE_SAMPLE_RATE });

      if (this.audioContext.state === 'suspended') {
        console.log('Audio context suspended, resuming...');
        await this.audioContext.resume();
      }

      // If a pipeline is wired up, route through the WebRTC loopback so Chrome's
      // AEC sees the playback as a reference signal. Returns the AEC-processed
      // mic stream — or the original stream if the browser doesn't support it.
      const recordStream = useLoopback
        ? await this.pipeline!.enableLoopback(this.stream)
        : this.stream;

      this.recordSourceNode =
        this.audioContext.createMediaStreamSource(recordStream);

      await this.setupAudioWorklet();
      this.isStreaming = true;
      console.log('Continuous audio streaming started');
    } catch (error) {
      console.error('Error starting continuous audio:', error);
      throw error;
    }
  }

  private async setupAudioWorklet(): Promise<void> {
    if (!this.audioContext || !this.recordSourceNode) return;

    await this.audioContext.audioWorklet.addModule('/audio-processor.js');
    console.log('AudioWorklet processor loaded');

    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      'audio-processor',
      { channelCount: 1 }
    );

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      if (this.isStreaming) {
        const int16Buffer = event.data as ArrayBuffer;
        const base64Audio = btoa(
          String.fromCharCode(...new Uint8Array(int16Buffer))
        );
        this.emit('audioChunk', base64Audio);
      }
    };

    this.recordSourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  stopStreaming(): void {
    console.log('Stopping continuous audio streaming...');
    this.isStreaming = false;

    if (this.isIOS && this.iosHandler) {
      this.iosHandler.stopMicrophone?.();
      console.log('[AudioHandler] iOS microphone stopped');
      return;
    }

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.recordSourceNode) {
      this.recordSourceNode.disconnect();
      this.recordSourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Tear down the loopback so playback flows back through ctx.destination.
    if (this.pipeline) {
      this.pipeline.disableLoopback();
    }

    console.log('Continuous audio streaming stopped');
  }

  getIsStreaming(): boolean {
    return this.isStreaming;
  }
}
