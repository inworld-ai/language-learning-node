/**
 * InworldLLM — uses Inworld LLM Router API for:
 * - Flashcard generation from conversation context
 * - User feedback (grammar/vocab corrections)
 * - Translation (replacing browser-side Google Translate)
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('InworldLLM');

const LLM_URL = 'https://api.inworld.ai/v1/chat/completions';
const TTS_URL = 'https://api.inworld.ai/tts/v1/voice';

interface Flashcard {
  targetWord: string;
  english: string;
  example: string;
  mnemonic: string;
  timestamp: string;
}

export class InworldLLM {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.INWORLD_API_KEY || '';
  }

  async generateFlashcard(
    messages: Array<{ role: string; content: string }>,
    targetLanguage: string
  ): Promise<Flashcard | null> {
    const conversation = messages
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `You generate flashcards for a ${targetLanguage} learning app.

Based on this conversation, generate ONE flashcard for an interesting vocabulary word used by the teacher.

## Conversation
${conversation}

## Guidelines
- Pick a word the student likely doesn't know
- The word must be from the conversation
- Avoid cognates
- Return ONLY valid JSON

{
  "targetWord": "word in ${targetLanguage}",
  "english": "English translation",
  "example": "Example sentence in ${targetLanguage}",
  "mnemonic": "Memory aid in English"
}`;

    const result = await this.complete(prompt);
    if (!result) return null;

    try {
      const card = JSON.parse(result);
      if (!card.targetWord || !card.english) return null;
      card.timestamp = new Date().toISOString();
      return card;
    } catch {
      logger.warn('flashcard_parse_failed');
      return null;
    }
  }

  async generateFeedback(
    messages: Array<{ role: string; content: string }>,
    userUtterance: string,
    targetLanguage: string,
    previousFeedback: string[]
  ): Promise<string | null> {
    const conversation = messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prevFeedbackSection =
      previousFeedback.length > 0
        ? `\n## Previous feedback (DO NOT repeat):\n${previousFeedback.map((f) => `- ${f}`).join('\n')}`
        : '';

    const prompt = `You are a ${targetLanguage} language tutor assistant. Analyze the student's most recent utterance and provide brief, helpful feedback.

## Student level: INTERMEDIATE

## Conversation:
${conversation}

## Student's last utterance:
${userUtterance}
${prevFeedbackSection}

## Instructions:
- The student's text comes from SPEECH-TO-TEXT. IGNORE spelling, punctuation, capitalization — these are transcription artifacts.
- Focus ONLY on: grammar, vocabulary choice, verb conjugations, gender agreement, sentence structure.
- If errors exist, provide a clear correction.
- If the response was good, offer a specific tip to level up.
- Keep to exactly ONE sentence in English.
- DO NOT repeat previous feedback.

Your feedback (one sentence in English):`;

    return this.complete(prompt, 100, 0.7);
  }

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    const sourceDesc =
      sourceLang === 'auto' ? 'the source language' : sourceLang;
    const prompt = `Translate the following text from ${sourceDesc} to ${targetLang}. Return ONLY the translation, nothing else.

Text: ${text}`;

    const result = await this.complete(prompt, 200, 0.3);
    return result || text;
  }

  /**
   * Pronounce text using Inworld TTS API.
   * Returns base64-encoded LINEAR16 audio at 24kHz, or null on failure.
   */
  async pronounce(
    text: string,
    voiceId: string,
    bcp47: string
  ): Promise<string | null> {
    if (!this.apiKey) return null;

    try {
      const response = await fetch(TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.apiKey}`,
        },
        body: JSON.stringify({
          text,
          voice_id: voiceId,
          model_id: 'inworld-tts-2',
          language: bcp47,
          audio_config: {
            audio_encoding: 'LINEAR16',
            sample_rate_hertz: 24000,
          },
        }),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'tts_request_failed');
        return null;
      }

      const data = (await response.json()) as { audioContent?: string };
      return data.audioContent || null;
    } catch (err) {
      logger.warn({ err }, 'tts_request_error');
      return null;
    }
  }

  // ── Private ──────────────────────────────────────────────

  private async complete(
    prompt: string,
    maxTokens: number = 250,
    temperature: number = 1.0
  ): Promise<string | null> {
    if (!this.apiKey) {
      logger.warn('no_api_key');
      return null;
    }

    try {
      const response = await fetch(LLM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-nano',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
        }),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'llm_request_failed');
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      logger.warn({ err }, 'llm_request_error');
      return null;
    }
  }
}
