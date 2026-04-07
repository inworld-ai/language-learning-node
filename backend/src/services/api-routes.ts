/**
 * API Routes
 *
 * Express router for REST API endpoints.
 */

import { Router } from 'express';
import { AnkiExporter, ExportableFlashcard } from '../helpers/anki-exporter.js';
import { generateBatchTTSAudio } from '../helpers/tts-audio-generator.js';
import {
  getLanguageOptions,
  DEFAULT_LANGUAGE_CODE,
} from '../config/languages.js';
import { serverLogger as logger } from '../utils/logger.js';

export const apiRouter = Router();

// ANKI export endpoint
apiRouter.post('/export-anki', async (req, res) => {
  try {
    const { flashcards, deckName, languageCode } = req.body;

    if (!flashcards || !Array.isArray(flashcards) || flashcards.length === 0) {
      res.status(400).json({ error: 'No flashcards provided' });
      return;
    }

    const exporter = new AnkiExporter();
    const validCount = exporter.countValidFlashcards(
      flashcards as ExportableFlashcard[]
    );

    if (validCount === 0) {
      res.status(400).json({ error: 'No valid flashcards to export' });
      return;
    }

    const lang = languageCode || DEFAULT_LANGUAGE_CODE;
    const texts: string[] = [];

    for (const fc of flashcards as ExportableFlashcard[]) {
      const word = (fc.targetWord || '').trim();
      if (word) texts.push(word);

      const sentence = (fc.example || '').trim();
      if (sentence) texts.push(sentence);
    }

    const uniqueTexts = [...new Set(texts)];

    logger.info(
      { textCount: uniqueTexts.length, languageCode: lang },
      'anki_export_generating_audio'
    );

    const audioMap = await generateBatchTTSAudio(uniqueTexts, lang);

    logger.info(
      {
        audioCount: audioMap.size,
        requestedTexts: uniqueTexts.length,
      },
      'anki_export_audio_generation_complete'
    );

    const defaultDeckName = 'Language Tutor Cards';
    const apkgBuffer = await exporter.exportFlashcards(
      flashcards as ExportableFlashcard[],
      deckName || defaultDeckName,
      audioMap
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
    const languages = getLanguageOptions();
    res.json({ languages, defaultLanguage: DEFAULT_LANGUAGE_CODE });
  } catch (error) {
    logger.error({ err: error }, 'get_languages_error');
    res.status(500).json({ error: 'Failed to get languages' });
  }
});

// Note: Health check is at the root level (/health) in server.ts
