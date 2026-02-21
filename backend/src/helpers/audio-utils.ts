/**
 * Audio utility functions for format conversion
 */

/**
 * Encode raw PCM16 samples as a WAV file buffer.
 * Returns a complete .wav file that can be written to disk or embedded in an Anki package.
 */
export function encodeWav(
  pcm16: Int16Array,
  sampleRate: number,
  numChannels: number = 1
): Buffer {
  const bytesPerSample = 2;
  const dataByteLength = pcm16.length * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataByteLength);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // block align
  buffer.writeUInt16LE(bytesPerSample * 8, 34); // bits per sample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  // PCM samples (little-endian Int16, which is how Int16Array is stored on LE systems)
  const pcm16Bytes = Buffer.from(
    pcm16.buffer,
    pcm16.byteOffset,
    pcm16.byteLength
  );
  pcm16Bytes.copy(buffer, headerSize);

  return buffer;
}

/**
 * Convert Float32Array audio data to Int16Array (PCM16)
 */
export function float32ToPCM16(float32Data: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Data.length);
  for (let i = 0; i < float32Data.length; i++) {
    // Clamp to [-1, 1] range and convert to Int16 range [-32768, 32767]
    const s = Math.max(-1, Math.min(1, float32Data[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Convert number[] or Float32Array audio data to Int16Array (PCM16)
 * This is an optimized version that handles both types to avoid
 * intermediate allocations in the audio pipeline.
 */
export function audioDataToPCM16(
  audioData: number[] | Float32Array
): Int16Array {
  const pcm16 = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    // Clamp to [-1, 1] range and convert to Int16 range [-32768, 32767]
    const s = Math.max(-1, Math.min(1, audioData[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Convert Int16Array (PCM16) to Float32Array
 */
export function pcm16ToFloat32(pcm16Data: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16Data.length);
  for (let i = 0; i < pcm16Data.length; i++) {
    float32[i] = pcm16Data[i] / 32768.0;
  }
  return float32;
}

/**
 * Convert audio data to PCM16 base64 string for WebSocket transmission
 */
export function convertToPCM16Base64(
  audioData: number[] | Float32Array | string | undefined,
  _sampleRate: number | undefined,
  _logPrefix: string = 'Audio'
): string | null {
  if (!audioData) {
    return null;
  }

  let base64Data: string;

  if (typeof audioData === 'string') {
    // Already base64 encoded
    base64Data = audioData;
  } else {
    // Convert Float32 array to PCM16 base64
    const float32Data = Array.isArray(audioData)
      ? new Float32Array(audioData)
      : audioData;
    const pcm16Data = float32ToPCM16(float32Data);
    base64Data = Buffer.from(pcm16Data.buffer).toString('base64');
  }

  return base64Data;
}

/**
 * Decode base64 audio to Float32Array
 * Frontend sends Float32 audio data directly (4 bytes per sample)
 * Note: Node.js Buffer objects share ArrayBuffers with offsets, so we need to copy
 */
export function decodeBase64ToFloat32(base64Audio: string): Float32Array {
  const buffer = Buffer.from(base64Audio, 'base64');
  // Create a clean copy to avoid Node.js Buffer's internal ArrayBuffer sharing
  const cleanArray = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    cleanArray[i] = buffer[i];
  }
  // Interpret bytes directly as Float32 (4 bytes per sample)
  return new Float32Array(cleanArray.buffer);
}

/**
 * Convert audio data to base64 string for WebSocket transmission
 * Inworld TTS returns Float32 PCM in [-1.0, 1.0] range - send directly to preserve quality
 */
export function convertAudioToBase64(audio: {
  data?: string | number[] | Float32Array;
  sampleRate?: number;
}): { base64: string; format: 'float32' | 'int16' } | null {
  if (!audio.data) return null;

  if (typeof audio.data === 'string') {
    // Already base64 - assume Int16 format for backwards compatibility
    return { base64: audio.data, format: 'int16' };
  }

  // Inworld SDK returns audio.data as an array of raw bytes (0-255)
  // These bytes ARE the Float32 PCM data in IEEE 754 format (4 bytes per sample)
  // Simply pass them through as-is, and frontend interprets as Float32Array
  const audioBuffer = Array.isArray(audio.data)
    ? Buffer.from(audio.data) // Treat each array element as a byte
    : Buffer.from(
        audio.data.buffer,
        audio.data.byteOffset,
        audio.data.byteLength
      );

  return {
    base64: audioBuffer.toString('base64'),
    format: 'float32', // Frontend will interpret bytes as Float32Array
  };
}
