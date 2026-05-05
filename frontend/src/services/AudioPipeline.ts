/**
 * Owns the shared playback AudioContext and master output node.
 *
 * - All TTS playback (streaming voice + flashcard pronunciation) routes through
 *   `getOutputNode()` so a single node controls where audio actually exits.
 * - When a mic stream is active, `enableLoopback(stream)` reroutes that output
 *   through a WebRTC loopback so Chrome's AEC sees the playback as an explicit
 *   reference signal — and returns the AEC-processed mic stream.
 * - On Firefox / iOS Safari (no loopback support), playback flows directly to
 *   `ctx.destination` and the original mic stream is returned unchanged.
 */

import {
  WebRtcLoopbackSession,
  isWebRtcLoopbackSupported,
} from './WebRtcLoopback';

const PLAYBACK_SAMPLE_RATE = 24000; // matches Inworld TTS-2 output

export class AudioPipeline {
  private playbackContext: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private loopbackDest: MediaStreamAudioDestinationNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private loopback: WebRtcLoopbackSession | null = null;
  private loopbackActive = false;

  /** Lazily create the playback context. Call from a user-gesture handler so
   *  autoplay policies don't block the first audio frame. */
  ensurePlaybackContext(): AudioContext {
    if (this.playbackContext && this.playbackContext.state !== 'closed') {
      return this.playbackContext;
    }
    const Ctor = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctor({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.playbackContext = ctx;

    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ctx.destination);
    this.outputNode = out;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        /* gesture expired; will retry on next play */
      });
    }
    return ctx;
  }

  getPlaybackContext(): AudioContext {
    return this.ensurePlaybackContext();
  }

  /** Sink that AudioPlayer instances connect their gain output to. */
  getOutputNode(): AudioNode {
    this.ensurePlaybackContext();
    return this.outputNode!;
  }

  isLoopbackActive(): boolean {
    return this.loopbackActive;
  }

  /**
   * Wire a WebRTC loopback so Chrome's AEC can use TTS playback as a reference.
   * Returns the AEC-processed mic stream — or the original mic stream when
   * loopback isn't supported / setup fails.
   *
   * Safe to call multiple times; existing loopback is closed first.
   */
  async enableLoopback(micStream: MediaStream): Promise<MediaStream> {
    if (!isWebRtcLoopbackSupported()) {
      return micStream;
    }
    const ctx = this.ensurePlaybackContext();

    if (!this.loopbackDest) {
      this.loopbackDest = ctx.createMediaStreamDestination();
    }
    if (this.outputNode) {
      try {
        this.outputNode.disconnect();
      } catch {
        /* not connected */
      }
      this.outputNode.connect(this.loopbackDest);
    }

    if (!this.audioElement) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.hidden = true;
      document.body.appendChild(el);
      this.audioElement = el;
    }

    if (this.loopback) {
      this.loopback.close();
    }
    this.loopback = new WebRtcLoopbackSession();

    try {
      await this.loopback.start(micStream, this.loopbackDest.stream);

      if (this.loopback.isPassthrough()) {
        // Browser doesn't support loopback — restore direct routing.
        this.disableLoopback();
        return micStream;
      }

      this.audioElement.srcObject = this.loopback.getPlaybackStream();
      this.audioElement.play().catch((err) => {
        console.warn('[AudioPipeline] <audio>.play() blocked:', err);
      });

      this.loopbackActive = true;
      return this.loopback.getRecordStream();
    } catch (err) {
      console.warn(
        '[AudioPipeline] WebRTC loopback failed, falling back to direct path:',
        err
      );
      this.disableLoopback();
      return micStream;
    }
  }

  /** Restore direct routing: outputNode → ctx.destination. Active sources keep playing. */
  disableLoopback(): void {
    if (this.audioElement) {
      this.audioElement.srcObject = null;
    }
    if (this.loopback) {
      this.loopback.close();
      this.loopback = null;
    }
    if (this.outputNode && this.playbackContext) {
      try {
        this.outputNode.disconnect();
      } catch {
        /* not connected */
      }
      this.outputNode.connect(this.playbackContext.destination);
    }
    this.loopbackActive = false;
  }

  destroy(): void {
    this.disableLoopback();
    if (this.audioElement) {
      this.audioElement.remove();
      this.audioElement = null;
    }
    if (this.outputNode) {
      try {
        this.outputNode.disconnect();
      } catch {
        /* not connected */
      }
      this.outputNode = null;
    }
    if (this.playbackContext) {
      this.playbackContext.close().catch(() => {});
      this.playbackContext = null;
    }
    this.loopbackDest = null;
  }
}
