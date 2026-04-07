/**
 * Batch TTS Audio Generator
 *
 * Generates WAV audio buffers for flashcard words and example sentences
 * using the Inworld TTS API (direct HTTP calls, not SDK graphs).
 * Used by the Anki exporter to embed pronunciation audio into .apkg files.
 */

import { getLanguageConfig } from '../config/languages.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('TTSAudioGenerator');

const TTS_URL = 'https://api.inworld.ai/tts/v1/voice';

export interface GeneratedAudio {
  filename: string;
  buffer: Buffer;
}

/**
 * Encode raw LINEAR16 PCM data into a WAV file buffer.
 */
function encodeWav(
  pcmBuffer: Buffer,
  sampleRate: number,
  channels: number = 1,
  bitDepth: number = 16
): Buffer {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize - 8, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk1 size (PCM)
  header.writeUInt16LE(1, 20); // audio format (PCM = 1)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generate a WAV audio buffer for a single text via the Inworld TTS API.
 */
async function generateTTSAudio(
  text: string,
  languageCode: string
): Promise<Buffer | null> {
  const apiKey = process.env.INWORLD_API_KEY;
  if (!apiKey) {
    logger.warn('INWORLD_API_KEY not set, skipping TTS generation');
    return null;
  }

  const langConfig = getLanguageConfig(languageCode);
  const voiceId = langConfig.ttsConfig.speakerId;

  const response = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      text: text.trim(),
      voice_id: voiceId,
      model_id: 'inworld-tts-1.5-max',
      audio_config: {
        audio_encoding: 'LINEAR16',
        sample_rate_hertz: 24000,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    logger.warn(
      { status: response.status, error: errorText, text },
      'tts_api_request_failed'
    );
    return null;
  }

  const data = (await response.json()) as { audioContent?: string };
  if (!data.audioContent) {
    logger.warn({ text }, 'tts_api_returned_no_audio');
    return null;
  }

  let pcmBuffer = Buffer.from(data.audioContent, 'base64');

  // Strip WAV header if the API returned one — avoid double-wrapping.
  // WAV header starts with "RIFF" (0x52 0x49 0x46 0x46) and is 44 bytes.
  if (
    pcmBuffer.length > 44 &&
    pcmBuffer[0] === 0x52 &&
    pcmBuffer[1] === 0x49 &&
    pcmBuffer[2] === 0x46 &&
    pcmBuffer[3] === 0x46
  ) {
    pcmBuffer = pcmBuffer.slice(44);
  }

  return encodeWav(pcmBuffer, 24000, 1, 16);
}

/**
 * Generate TTS audio for multiple texts in sequence.
 * Returns a map from the original text to the WAV filename and buffer.
 */
export async function generateBatchTTSAudio(
  texts: string[],
  languageCode: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, GeneratedAudio>> {
  const results = new Map<string, GeneratedAudio>();
  const total = texts.length;

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    try {
      const wavBuffer = await generateTTSAudio(text, languageCode);
      if (wavBuffer) {
        const sanitized = text
          .trim()
          .toLowerCase()
          .replace(
            /[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\u3000-\u9FFF\uAC00-\uD7AF]/g,
            '_'
          )
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        const filename = `tts_${sanitized.slice(0, 60)}_${i}.wav`;
        results.set(text, { filename, buffer: wavBuffer });
      }
      onProgress?.(i + 1, total);
    } catch (error) {
      logger.warn(
        { text, languageCode, err: error },
        'tts_batch_generation_failed_for_text'
      );
      onProgress?.(i + 1, total);
    }
  }

  return results;
}
