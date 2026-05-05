import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import {
  SessionManager,
  stripBracketedTags,
} from '../services/session-manager.js';

// Mock ws module so SessionManager doesn't make real connections
vi.mock('ws', () => {
  const sent: string[] = [];
  const MockWebSocket = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn((data: string) => sent.push(data)),
    close: vi.fn(),
    readyState: 1, // OPEN
  }));
  (MockWebSocket as unknown as Record<string, unknown>).OPEN = 1;
  (MockWebSocket as unknown as Record<string, unknown>)._sent = sent;
  return { default: MockWebSocket, WebSocket: MockWebSocket };
});

function createMockClientWs() {
  const messages: string[] = [];
  return {
    readyState: 1,
    send: vi.fn((data: string) => messages.push(data)),
    _messages: messages,
  } as unknown as WebSocket;
}

describe('stripBracketedTags', () => {
  it('removes a leading steering tag and trims', () => {
    expect(stripBracketedTags('[speak warmly] Hello there')).toBe(
      'Hello there'
    );
  });

  it('removes inline non-verbal tags', () => {
    expect(stripBracketedTags('That is funny [laugh] really')).toBe(
      'That is funny really'
    );
  });

  it('collapses double spaces left by removed tags', () => {
    expect(stripBracketedTags('one [tag] two')).toBe('one two');
  });

  it('removes the space before punctuation when a tag preceded it', () => {
    expect(stripBracketedTags('Hello [laugh] , how are you')).toBe(
      'Hello, how are you'
    );
  });

  it('preserves disfluency text (no brackets) untouched', () => {
    expect(stripBracketedTags('えーと、そうですね')).toBe('えーと、そうですね');
  });

  it('handles multiple bracketed tags in one string', () => {
    expect(
      stripBracketedTags('[speak gently] Pues [sigh] no sé qué decir')
    ).toBe('Pues no sé qué decir');
  });
});

describe('SessionManager', () => {
  const originalEnv = process.env.INWORLD_API_KEY;

  beforeEach(() => {
    process.env.INWORLD_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.INWORLD_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe('triggerGreeting', () => {
    it('should send a hidden user message + response.create on first call', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-1',
        ws: clientWs,
        languageCode: 'es',
      });

      // Simulate that the Inworld WS is connected and session is ready
      // Access private fields for testing
      const mgrAny = mgr as unknown as Record<string, unknown>;
      const mockInworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.inworldWs = mockInworldWs;
      mgrAny.sessionReady = true;

      mgr.triggerGreeting();

      // Should have sent 2 messages: conversation.item.create + response.create
      expect(mockInworldWs.send).toHaveBeenCalledTimes(2);

      const msg1 = JSON.parse(mockInworldWs.send.mock.calls[0][0]);
      expect(msg1.type).toBe('conversation.item.create');
      expect(msg1.item.role).toBe('user');
      expect(msg1.item.content[0].text).toContain('Say hi');
      expect(msg1.item.content[0].text).toContain('Spanish');
      expect(msg1.item.id).toMatch(/^greeting-/);

      const msg2 = JSON.parse(mockInworldWs.send.mock.calls[1][0]);
      expect(msg2.type).toBe('response.create');
    });

    it('should set greetingItemId for suppression', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-2',
        ws: clientWs,
        languageCode: 'fr',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.inworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.sessionReady = true;

      mgr.triggerGreeting();

      expect(mgrAny.greetingItemId).toMatch(/^greeting-/);
    });

    it('should only greet once (turnCount > 0 blocks)', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-3',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      const mockInworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.inworldWs = mockInworldWs;
      mgrAny.sessionReady = true;
      mgrAny.turnCount = 1; // Already had a turn

      mgr.triggerGreeting();

      expect(mockInworldWs.send).not.toHaveBeenCalled();
    });

    it('should not send if session is not ready', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-4',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.inworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.sessionReady = false;

      mgr.triggerGreeting();

      expect(
        (mgrAny.inworldWs as { send: ReturnType<typeof vi.fn> }).send
      ).not.toHaveBeenCalled();
    });

    it('should use correct language name in greeting prompt', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-5',
        ws: clientWs,
        languageCode: 'de',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      const mockInworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.inworldWs = mockInworldWs;
      mgrAny.sessionReady = true;

      mgr.triggerGreeting();

      const msg = JSON.parse(mockInworldWs.send.mock.calls[0][0]);
      expect(msg.item.content[0].text).toContain('German');
    });
  });

  describe('greeting suppression in handleInworldEvent', () => {
    it('should suppress conversation.item.done for greeting item', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-6',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.inworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.sessionReady = true;

      // Trigger greeting to set the greetingItemId
      mgr.triggerGreeting();
      const greetingId = mgrAny.greetingItemId as string;
      expect(greetingId).toBeTruthy();

      // Simulate the Inworld server echoing back the greeting item
      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;
      handler.call(mgr, {
        type: 'conversation.item.done',
        item: {
          id: greetingId,
          role: 'user',
          content: [
            { type: 'input_text', text: '[The student just joined...]' },
          ],
        },
      });

      // Should NOT have sent a transcription to the client
      const transcriptions = clientWs._messages
        .map((m: string) => JSON.parse(m))
        .filter((m: Record<string, unknown>) => m.type === 'transcription');
      expect(transcriptions).toHaveLength(0);

      // greetingItemId should be cleared
      expect(mgrAny.greetingItemId).toBeNull();
    });

    it('should forward input_text user messages as transcriptions via conversation.item.done', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-7',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;
      handler.call(mgr, {
        type: 'conversation.item.done',
        item: {
          id: 'real-user-msg',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hola amigo' }],
        },
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const transcriptions = sent
        .map((m) => JSON.parse(m))
        .filter((m) => m.type === 'transcription');
      expect(transcriptions).toHaveLength(1);
      expect(transcriptions[0].text).toBe('Hola amigo');
    });

    it('should NOT forward audio transcriptions via conversation.item.done (handled by transcription.completed)', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-7b',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;
      handler.call(mgr, {
        type: 'conversation.item.done',
        item: {
          id: 'audio-user-msg',
          role: 'user',
          content: [{ type: 'input_audio', transcript: 'Hola amigo' }],
        },
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const transcriptions = sent
        .map((m) => JSON.parse(m))
        .filter((m) => m.type === 'transcription');
      // Audio transcriptions are handled by transcription.completed, not here
      expect(transcriptions).toHaveLength(0);
    });
  });

  describe('streaming STT events', () => {
    it('should treat transcription deltas as cumulative (Soniox)', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-stt-1',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;

      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'Hola',
      });

      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'Hola, me llamo Cale.',
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const partials = sent
        .map((m) => JSON.parse(m))
        .filter(
          (m: Record<string, unknown>) => m.type === 'partial_transcript'
        );
      expect(partials).toHaveLength(2);
      expect(partials[0].text).toBe('Hola');
      expect(partials[1].text).toBe('Hola, me llamo Cale.');
    });

    it('should reset text buffer after completed transcript', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-stt-1b',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;

      // First utterance
      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'Hola',
      });
      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Hola',
      });

      // Second utterance — buffer should be reset
      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'Adiós',
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const partials = sent
        .map((m) => JSON.parse(m))
        .filter(
          (m: Record<string, unknown>) => m.type === 'partial_transcript'
        );
      // Second delta should NOT accumulate with first utterance
      expect(partials[partials.length - 1].text).toBe('Adiós');
    });

    it('should forward completed transcription', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-stt-2',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;
      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Hola como estas',
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const transcriptions = sent
        .map((m) => JSON.parse(m))
        .filter((m: Record<string, unknown>) => m.type === 'transcription');
      expect(transcriptions).toHaveLength(1);
      expect(transcriptions[0].text).toBe('Hola como estas');
    });

    it('should NOT send speech_ended to prevent flicker', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-stt-3',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;
      handler.call(mgr, { type: 'input_audio_buffer.speech_stopped' });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      // Should NOT send speech_ended — we keep the partial transcript visible
      expect(sent).toHaveLength(0);
    });

    it('should include transcription model in session update', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-stt-4',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      const mockInworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.inworldWs = mockInworldWs;

      // Call sendSessionUpdate directly
      const sendUpdate = mgrAny.sendSessionUpdate as () => void;
      sendUpdate.call(mgr);

      const sent = JSON.parse(mockInworldWs.send.mock.calls[0][0]);
      expect(sent.type).toBe('session.update');
      expect(sent.session.audio.input.transcription.model).toBe(
        'soniox/stt-rt-v4'
      );
      expect(sent.session.audio.input.transcription.language).toBe('es');
      expect(sent.session.providerData.tts.language).toBe('es-MX');
      expect(sent.session.model).toBe('openai/gpt-5.4-mini');
    });

    it('should strip steering and non-verbal tags from completed assistant transcript', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-strip-1',
        ws: clientWs,
        languageCode: 'ja',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;
      handler.call(mgr, {
        type: 'response.output_audio_transcript.done',
        transcript:
          '[speak gently] なるほど、忙しいですね。[laugh] 趣味はありますか？',
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const completes = sent
        .map((m) => JSON.parse(m))
        .filter(
          (m: Record<string, unknown>) => m.type === 'llm_response_complete'
        );
      expect(completes).toHaveLength(1);
      expect(completes[0].text).not.toContain('[');
      expect(completes[0].text).not.toContain(']');
      expect(completes[0].text).toContain('なるほど');
      expect(completes[0].text).toContain('趣味はありますか');
    });

    it('should strip a bracketed tag that straddles two streaming deltas', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-strip-2',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (
        event: Record<string, unknown>
      ) => void;

      handler.call(mgr, {
        type: 'response.output_audio_transcript.delta',
        delta: 'Hola, [spe',
      });
      handler.call(mgr, {
        type: 'response.output_audio_transcript.delta',
        delta: 'ak warmly] ¿qué tal?',
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const chunks = sent
        .map((m) => JSON.parse(m))
        .filter(
          (m: Record<string, unknown>) => m.type === 'llm_response_chunk'
        );
      const concatenated = chunks.map((c) => c.text).join('');
      expect(concatenated).not.toContain('[');
      expect(concatenated).not.toContain(']');
      expect(concatenated).toContain('Hola');
      expect(concatenated).toContain('¿qué tal?');
    });

    it('should include TTS-2 expressivity guidance with steering, nonverbal, and target-language disfluencies', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-expressivity-1',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      const mockInworldWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      };
      mgrAny.inworldWs = mockInworldWs;

      const sendUpdate = mgrAny.sendSessionUpdate as () => void;
      sendUpdate.call(mgr);

      const sent = JSON.parse(mockInworldWs.send.mock.calls[0][0]);
      const instructions = sent.session.instructions as string;

      // Steering tag example
      expect(instructions).toContain('[speak');
      // Non-verbal tag
      expect(instructions).toContain('[laugh]');
      // Spanish disfluency from the seeded list
      expect(instructions).toContain('este');
    });
  });
});
