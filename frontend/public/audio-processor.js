/**
 * AudioWorklet processor for capturing and resampling microphone audio.
 * Resamples to 24kHz PCM16 for Inworld Realtime API.
 * Buffers to 100ms chunks (2400 samples at 24kHz).
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sourceSampleRate = options.processorOptions.sourceSampleRate;
    this.targetSampleRate = 24000;
    this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;

    this.inputBuffer = null;
    this.outputBuffer = [];
    this.outputBufferSize = 2400; // 100ms at 24kHz
  }

  process(inputs) {
    const inputChannel = inputs[0][0];
    if (!inputChannel) return true;

    // Accumulate input samples
    const currentLength = this.inputBuffer ? this.inputBuffer.length : 0;
    const newBuffer = new Float32Array(currentLength + inputChannel.length);
    if (this.inputBuffer) {
      newBuffer.set(this.inputBuffer, 0);
    }
    newBuffer.set(inputChannel, currentLength);
    this.inputBuffer = newBuffer;

    // Resample to 24kHz
    const numOutputSamples = Math.floor(
      this.inputBuffer.length / this.resampleRatio,
    );
    if (numOutputSamples === 0) return true;

    const resampledData = new Float32Array(numOutputSamples);
    for (let i = 0; i < numOutputSamples; i++) {
      const correspondingInputIndex = i * this.resampleRatio;
      const lowerIndex = Math.floor(correspondingInputIndex);
      const upperIndex = Math.ceil(correspondingInputIndex);
      const interpolationFactor = correspondingInputIndex - lowerIndex;

      const lowerValue = this.inputBuffer[lowerIndex] || 0;
      const upperValue = this.inputBuffer[upperIndex] || 0;

      resampledData[i] =
        lowerValue + (upperValue - lowerValue) * interpolationFactor;
    }

    // Keep unconsumed input samples
    const consumedInputSamples = numOutputSamples * this.resampleRatio;
    this.inputBuffer = this.inputBuffer.slice(Math.round(consumedInputSamples));

    // Convert to Int16 and buffer to 100ms chunks
    for (let i = 0; i < resampledData.length; i++) {
      this.outputBuffer.push(
        Math.max(-32768, Math.min(32767, resampledData[i] * 32768)),
      );

      if (this.outputBuffer.length >= this.outputBufferSize) {
        const int16Array = new Int16Array(this.outputBuffer);
        this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
        this.outputBuffer = [];
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
