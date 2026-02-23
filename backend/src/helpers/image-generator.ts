/**
 * Image Generator using Replicate API (FLUX Schnell model)
 *
 * Generates illustrative images for flashcard words to aid visual memory.
 */

import { serverLogger as logger } from '../utils/logger.js';

export interface GeneratedImage {
  filename: string;
  buffer: Buffer;
}

/**
 * Generate an image for a single word using Replicate's FLUX Schnell model.
 * Returns the image as a buffer, or null on failure.
 */
async function generateImage(
  word: string,
  englishWord: string,
  index: number
): Promise<GeneratedImage | null> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    logger.warn('REPLICATE_API_TOKEN not set, skipping image generation');
    return null;
  }

  const prompt = `a memorable, colorful, hand-drawn image of ${englishWord}`;

  const response = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt,
          go_fast: true,
          megapixels: '1',
          num_outputs: 1,
          aspect_ratio: '1:1',
          output_format: 'webp',
          output_quality: 80,
          num_inference_steps: 4,
        },
      }),
    }
  );

  if (!response.ok) {
    logger.warn(
      { status: response.status, word },
      'replicate_api_request_failed'
    );
    return null;
  }

  const data = (await response.json()) as {
    status: string;
    output?: string[];
  };

  if (data.status !== 'succeeded' || !data.output?.[0]) {
    logger.warn({ word, status: data.status }, 'replicate_prediction_failed');
    return null;
  }

  const imageUrl = data.output[0];
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    logger.warn({ word, imageUrl }, 'replicate_image_download_failed');
    return null;
  }

  const arrayBuffer = await imageResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const sanitized = word
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\u3000-\u9FFF\uAC00-\uD7AF]/g,
      '_'
    )
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const filename = `img_${sanitized}_${index}.webp`;

  return { filename, buffer };
}

/**
 * Generate images for multiple words in sequence.
 * @param wordToEnglish - Map from target-language word to its English translation (used as the image prompt).
 * Returns a map from the original target word to the image filename and buffer.
 */
export async function generateBatchImages(
  wordToEnglish: Map<string, string>
): Promise<Map<string, GeneratedImage>> {
  const results = new Map<string, GeneratedImage>();
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    logger.info(
      'REPLICATE_API_TOKEN not configured, skipping image generation'
    );
    return results;
  }

  let i = 0;
  for (const [word, english] of wordToEnglish) {
    try {
      const image = await generateImage(word, english, i);
      if (image) {
        results.set(word, image);
      }
    } catch (error) {
      logger.warn({ word, err: error }, 'image_generation_failed_for_word');
    }
    i++;
  }

  return results;
}
