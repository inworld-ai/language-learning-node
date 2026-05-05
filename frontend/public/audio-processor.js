/**
 * AudioWorklet processor — buffers mic samples into 100ms chunks (2400 samples
 * at 24kHz) and posts them to the main thread as Int16 PCM.
 *
 * The capture AudioContext is configured at 24kHz so the worklet receives
 * samples at the target rate directly — no resampling needed on every quantum.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.outputBufferSize = 2400; // 100ms @ 24kHz
    this.outputBuffer = new Int16Array(this.outputBufferSize);
    this.outputIndex = 0;
  }

  process(inputs) {
    const inputChannel = inputs[0]?.[0];
    if (!inputChannel || inputChannel.length === 0) return true;

    for (let i = 0; i < inputChannel.length; i++) {
      const sample = inputChannel[i];
      this.outputBuffer[this.outputIndex++] = Math.max(
        -32768,
        Math.min(32767, sample * 32768)
      );

      if (this.outputIndex >= this.outputBufferSize) {
        // Transfer the underlying buffer to avoid copying.
        const out = this.outputBuffer.buffer;
        this.port.postMessage(out, [out]);
        this.outputBuffer = new Int16Array(this.outputBufferSize);
        this.outputIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
