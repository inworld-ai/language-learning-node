/**
 * API Routes
 *
 * Express router for REST API endpoints.
 */

import { Router } from 'express';
import { AnkiExporter } from '../helpers/anki-exporter.js';
import { generateBatchTTSAudio } from '../helpers/tts-audio-generator.js';
import { generateBatchImages } from '../helpers/image-generator.js';
import { Flashcard } from '../helpers/flashcard-processor.js';
import {
  getLanguageOptions,
  DEFAULT_LANGUAGE_CODE,
} from '../config/languages.js';
import { getSttProvider } from '../config/server.js';
import { serverLogger as logger } from '../utils/logger.js';

export const apiRouter = Router();

// ANKI export endpoint
apiRouter.post('/export-anki', async (req, res) => {
  try {
    const {
      flashcards,
      deckName,
      languageCode,
    } = req.body;

    if (!flashcards || !Array.isArray(flashcards) || flashcards.length === 0) {
      res.status(400).json({ error: 'No flashcards provided' });
      return;
    }

    const exporter = new AnkiExporter();
    const validCount = exporter.countValidFlashcards(flashcards);

    if (validCount === 0) {
      res.status(400).json({ error: 'No valid flashcards to export' });
      return;
    }

    const lang = languageCode || DEFAULT_LANGUAGE_CODE;
    const texts: string[] = [];
    const wordToEnglish = new Map<string, string>();

    for (const fc of flashcards as Flashcard[]) {
      const word =
        (fc.targetWord || (fc as { spanish?: string }).spanish || '').trim();
      if (word) {
        texts.push(word);
        if (fc.english) {
          wordToEnglish.set(word, fc.english.trim());
        }
      }

      const sentence = (fc.example || '').trim();
      if (sentence) texts.push(sentence);
    }

    const uniqueTexts = [...new Set(texts)];

    logger.info(
      { textCount: uniqueTexts.length, imageCount: wordToEnglish.size, languageCode: lang },
      'anki_export_generating_media'
    );

    const [audioMap, imageMap] = await Promise.all([
      generateBatchTTSAudio(uniqueTexts, lang),
      generateBatchImages(wordToEnglish),
    ]);

    logger.info(
      {
        audioCount: audioMap.size,
        imageCount: imageMap.size,
        requestedTexts: uniqueTexts.length,
        requestedImages: wordToEnglish.size,
      },
      'anki_export_media_generation_complete'
    );

    const defaultDeckName = `Inworld Language Tutor Spanish Cards`;
    const apkgBuffer = await exporter.exportFlashcards(
      flashcards,
      deckName || defaultDeckName,
      audioMap,
      imageMap
    );

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(deckName || defaultDeckName).replace(/[^a-zA-Z0-9]/g, '_')}.apkg"`
    );
    res.send(apkgBuffer);
  } catch (error) {
    logger.error({ err: error }, 'anki_export_error');
    res.status(500).json({ error: 'Failed to export Anki deck' });
  }
});

// Languages endpoint
apiRouter.get('/languages', (_req, res) => {
  try {
    const languages = getLanguageOptions(getSttProvider());
    res.json({ languages, defaultLanguage: DEFAULT_LANGUAGE_CODE });
  } catch (error) {
    logger.error({ err: error }, 'get_languages_error');
    res.status(500).json({ error: 'Failed to get languages' });
  }
});

// Health check endpoint for Cloud Run
apiRouter.get('/health', (_req, res) => {
  res
    .status(200)
    .json({ status: 'healthy', timestamp: new Date().toISOString() });
});
