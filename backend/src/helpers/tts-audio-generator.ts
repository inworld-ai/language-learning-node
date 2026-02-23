/**
 * Batch TTS Audio Generator
 *
 * Generates WAV audio buffers for a list of words using the SimpleTTSGraph.
 * Used by the Anki exporter to embed pronunciation audio into .apkg files.
 */

import { GraphTypes } from '@inworld/runtime/graph';
import { getSimpleTTSGraph } from '../graphs/simple-tts-graph.js';
import { float32ToPCM16, encodeWav } from './audio-utils.js';
import { serverConfig } from '../config/server.js';
import { serverLogger as logger } from '../utils/logger.js';

export interface GeneratedAudio {
  filename: string;
  buffer: Buffer;
}

/**
 * Generate a WAV audio buffer for a single word via TTS.
 * Collects all streamed audio chunks into one contiguous buffer.
 */
export async function generateTTSAudio(
  text: string,
  languageCode: string
): Promise<Buffer | null> {
  const graph = getSimpleTTSGraph(languageCode);
  const executionResult = await graph.start({ text: text.trim() });

  const rawChunks: Buffer[] = [];

  for await (const res of executionResult.outputStream) {
    if ('processResponse' in res) {
      const resultWithProcess = res as {
        processResponse: (
          handlers: Record<string, (data: unknown) => Promise<void> | void>
        ) => Promise<void>;
      };
      await resultWithProcess.processResponse({
        TTSOutputStream: async (ttsData: unknown) => {
          const ttsStream = ttsData as GraphTypes.TTSOutputStream;
          for await (const chunk of ttsStream) {
            if (chunk.audio?.data) {
              const audioData = chunk.audio.data;
              if (typeof audioData === 'string') {
                rawChunks.push(Buffer.from(audioData, 'base64'));
              } else if (Array.isArray(audioData)) {
                rawChunks.push(Buffer.from(audioData));
              } else {
                rawChunks.push(
                  Buffer.from(
                    audioData.buffer,
                    audioData.byteOffset,
                    audioData.byteLength
                  )
                );
              }
            }
          }
        },
      });
    }
  }

  if (rawChunks.length === 0) {
    return null;
  }

  // Inworld TTS returns raw bytes that represent Float32 PCM samples
  const combined = Buffer.concat(rawChunks);
  const float32 = new Float32Array(
    combined.buffer,
    combined.byteOffset,
    combined.byteLength / 4
  );

  const pcm16 = float32ToPCM16(float32);
  const sampleRate = serverConfig.audio.ttsSampleRate;
  return encodeWav(pcm16, sampleRate);
}

/**
 * Generate TTS audio for multiple words in sequence.
 * Returns a map from the original word to the WAV filename and buffer.
 */
export async function generateBatchTTSAudio(
  words: string[],
  languageCode: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, GeneratedAudio>> {
  const results = new Map<string, GeneratedAudio>();
  const total = words.length;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    try {
      const wavBuffer = await generateTTSAudio(word, languageCode);
      if (wavBuffer) {
        const sanitized = word
          .trim()
          .toLowerCase()
          .replace(
            /[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\u3000-\u9FFF\uAC00-\uD7AF]/g,
            '_'
          )
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        const filename = `tts_${sanitized}_${i}.wav`;
        results.set(word, { filename, buffer: wavBuffer });
      }
      onProgress?.(i + 1, total);
    } catch (error) {
      logger.warn(
        { word, languageCode, err: error },
        'tts_batch_generation_failed_for_word'
      );
      onProgress?.(i + 1, total);
    }
  }

  return results;
}
