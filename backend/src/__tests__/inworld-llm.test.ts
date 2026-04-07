import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InworldLLM } from '../services/inworld-llm.js';

/** Helper to build an OpenAI-compatible chat completion response */
function chatResponse(content: string) {
  return {
    choices: [{ message: { content } }],
  };
}

describe('InworldLLM', () => {
  let llm: InworldLLM;
  const originalEnv = process.env.INWORLD_API_KEY;

  beforeEach(() => {
    process.env.INWORLD_API_KEY = 'test-key';
    llm = new InworldLLM();
  });

  afterEach(() => {
    process.env.INWORLD_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe('generateFlashcard', () => {
    it('should return a flashcard from valid LLM response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse(JSON.stringify({
          targetWord: 'perro',
          english: 'dog',
          example: 'El perro es grande.',
          mnemonic: 'Sounds like "pair-oh" — a pair of paws!',
        })),
      } as Response);

      const card = await llm.generateFlashcard(
        [{ role: 'assistant', content: 'El perro es muy grande.' }],
        'Spanish',
      );

      expect(card).not.toBeNull();
      expect(card!.targetWord).toBe('perro');
      expect(card!.english).toBe('dog');
      expect(card!.timestamp).toBeDefined();
    });

    it('should only use last 10 messages for context', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('{}'),
      } as Response);

      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`,
      }));

      await llm.generateFlashcard(messages, 'Spanish');

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      const prompt = body.messages[0].content;
      expect(prompt).not.toContain('message 0');
      expect(prompt).toContain('message 10');
      expect(prompt).toContain('message 19');
    });

    it('should return null on API failure', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const card = await llm.generateFlashcard(
        [{ role: 'assistant', content: 'Hola' }],
        'Spanish',
      );

      expect(card).toBeNull();
    });

    it('should return null on invalid JSON response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('not json'),
      } as Response);

      const card = await llm.generateFlashcard(
        [{ role: 'assistant', content: 'Hola' }],
        'Spanish',
      );

      expect(card).toBeNull();
    });

    it('should return null when targetWord is missing', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse(JSON.stringify({ english: 'dog' })),
      } as Response);

      const card = await llm.generateFlashcard(
        [{ role: 'assistant', content: 'Hola' }],
        'Spanish',
      );

      expect(card).toBeNull();
    });

    it('should return null when no API key', async () => {
      process.env.INWORLD_API_KEY = '';
      const noKeyLlm = new InworldLLM();

      const card = await noKeyLlm.generateFlashcard(
        [{ role: 'assistant', content: 'Hola' }],
        'Spanish',
      );

      expect(card).toBeNull();
    });

    it('should return null on network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

      const card = await llm.generateFlashcard(
        [{ role: 'assistant', content: 'Hola' }],
        'Spanish',
      );

      expect(card).toBeNull();
    });
  });

  describe('generateFeedback', () => {
    it('should return feedback string', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse(
          'Use "tienes" instead of "tienws" for correct conjugation.',
        ),
      } as Response);

      const feedback = await llm.generateFeedback(
        [
          { role: 'user', content: 'cuantos anos tienws' },
          { role: 'assistant', content: 'Tengo 35 años.' },
        ],
        'cuantos anos tienws',
        'Spanish',
        [],
      );

      expect(feedback).toContain('tienes');
    });

    it('should include previous feedback in the prompt to avoid repetition', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('New feedback.'),
      } as Response);

      await llm.generateFeedback(
        [{ role: 'user', content: 'test' }],
        'test',
        'Spanish',
        ['Previous point about grammar.'],
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.messages[0].content).toContain('Previous point about grammar.');
      expect(body.messages[0].content).toContain('DO NOT repeat');
    });

    it('should return null on API failure', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const feedback = await llm.generateFeedback(
        [{ role: 'user', content: 'test' }],
        'test',
        'Spanish',
        [],
      );

      expect(feedback).toBeNull();
    });
  });

  describe('translate', () => {
    it('should return translated text', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('The dog is big.'),
      } as Response);

      const result = await llm.translate('El perro es grande.', 'es', 'en');
      expect(result).toBe('The dog is big.');
    });

    it('should handle auto source language', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('Hello'),
      } as Response);

      await llm.translate('Hola', 'auto', 'en');

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.messages[0].content).toContain('the source language');
    });

    it('should return original text on failure', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const result = await llm.translate('El perro', 'es', 'en');
      expect(result).toBe('El perro');
    });
  });

  describe('API call format (OpenAI-compatible)', () => {
    it('should call the Inworld LLM Router endpoint with OpenAI format', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('{}'),
      } as Response);

      await llm.generateFlashcard(
        [{ role: 'user', content: 'test' }],
        'Spanish',
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.inworld.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Basic test-key',
          }),
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.model).toBe('openai/gpt-4.1-nano');
      expect(body.messages[0].role).toBe('user');
      expect(body.max_tokens).toBeDefined();
      expect(body.temperature).toBeDefined();
    });

    it('should use lower temperature for translation', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('Hello'),
      } as Response);

      await llm.translate('Hola', 'es', 'en');

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.temperature).toBe(0.3);
    });

    it('should use lower temperature for feedback', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => chatResponse('Good job.'),
      } as Response);

      await llm.generateFeedback(
        [{ role: 'user', content: 'Hola' }],
        'Hola',
        'Spanish',
        [],
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.temperature).toBe(0.7);
    });
  });

  describe('pronounce (TTS)', () => {
    it('should return base64 audio from Inworld TTS API', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ audioContent: 'base64audiodata==' }),
      } as Response);

      const audio = await llm.pronounce('Hola', 'Rafael');
      expect(audio).toBe('base64audiodata==');
    });

    it('should call TTS endpoint with correct params', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ audioContent: 'audio' }),
      } as Response);

      await llm.pronounce('perro', 'Rafael');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.inworld.ai/tts/v1/voice',
        expect.objectContaining({ method: 'POST' }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.text).toBe('perro');
      expect(body.voice_id).toBe('Rafael');
      expect(body.model_id).toBe('inworld-tts-1.5-max');
      expect(body.audio_config.audio_encoding).toBe('LINEAR16');
      expect(body.audio_config.sample_rate_hertz).toBe(24000);
    });

    it('should return null on API failure', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const audio = await llm.pronounce('Hola', 'Rafael');
      expect(audio).toBeNull();
    });

    it('should return null when no API key', async () => {
      process.env.INWORLD_API_KEY = '';
      const noKeyLlm = new InworldLLM();

      const audio = await noKeyLlm.pronounce('Hola', 'Rafael');
      expect(audio).toBeNull();
    });
  });
});
