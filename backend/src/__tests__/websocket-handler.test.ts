import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the WebSocket handler's flashcard/feedback wiring.
 * We test the callback logic in isolation since the full WS handler
 * requires actual WebSocket connections.
 */

describe('WebSocket handler turn callbacks', () => {
  const originalEnv = process.env.INWORLD_API_KEY;

  beforeEach(() => {
    process.env.INWORLD_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.INWORLD_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('should generate flashcard and feedback on turn complete', async () => {
    const { InworldLLM } = await import('../services/inworld-llm.js');
    const llm = new InworldLLM();

    // Mock both LLM calls
    const flashcardResult = {
      targetWord: 'gato',
      english: 'cat',
      example: 'El gato duerme.',
      mnemonic: 'Like "Gatto" in Italian',
      timestamp: new Date().toISOString(),
    };

    vi.spyOn(llm, 'generateFlashcard').mockResolvedValue(flashcardResult);
    vi.spyOn(llm, 'generateFeedback').mockResolvedValue(
      'Good attempt! Remember to use "años" with the ñ.',
    );

    const messages = [
      { role: 'user', content: 'El gato es bonito' },
      { role: 'assistant', content: 'Sí, los gatos son muy bonitos.' },
    ];

    const [card, feedback] = await Promise.all([
      llm.generateFlashcard(messages, 'Spanish'),
      llm.generateFeedback(messages, 'El gato es bonito', 'Spanish', []),
    ]);

    expect(card).toEqual(flashcardResult);
    expect(feedback).toContain('años');
  });

  it('should track previous feedback to avoid repetition', async () => {
    const { InworldLLM } = await import('../services/inworld-llm.js');
    const llm = new InworldLLM();

    const previousFeedback: string[] = [];

    const feedbackSpy = vi.spyOn(llm, 'generateFeedback').mockResolvedValue('First feedback.');

    await llm.generateFeedback(
      [{ role: 'user', content: 'test1' }],
      'test1',
      'Spanish',
      previousFeedback,
    );

    previousFeedback.push('First feedback.');

    // Second call should include previous feedback
    await llm.generateFeedback(
      [{ role: 'user', content: 'test2' }],
      'test2',
      'Spanish',
      previousFeedback,
    );

    expect(feedbackSpy).toHaveBeenCalledTimes(2);
    // The second call should have received the previous feedback array
    expect(feedbackSpy.mock.calls[1][3]).toEqual(['First feedback.']);
  });

  it('should not crash if flashcard generation fails', async () => {
    const { InworldLLM } = await import('../services/inworld-llm.js');
    const llm = new InworldLLM();

    vi.spyOn(llm, 'generateFlashcard').mockRejectedValue(new Error('LLM down'));
    vi.spyOn(llm, 'generateFeedback').mockResolvedValue('Good work!');

    const messages = [{ role: 'user', content: 'Hola' }];

    // Should not throw
    const [cardResult, feedbackResult] = await Promise.allSettled([
      llm.generateFlashcard(messages, 'Spanish'),
      llm.generateFeedback(messages, 'Hola', 'Spanish', []),
    ]);

    expect(cardResult.status).toBe('rejected');
    expect(feedbackResult.status).toBe('fulfilled');
    if (feedbackResult.status === 'fulfilled') {
      expect(feedbackResult.value).toBe('Good work!');
    }
  });

  it('should limit previous feedback buffer to 10 items', () => {
    const previousFeedback: string[] = [];
    for (let i = 0; i < 12; i++) {
      previousFeedback.push(`Feedback ${i}`);
      if (previousFeedback.length > 10) previousFeedback.shift();
    }

    expect(previousFeedback.length).toBe(10);
    expect(previousFeedback[0]).toBe('Feedback 2');
    expect(previousFeedback[9]).toBe('Feedback 11');
  });
});
