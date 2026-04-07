import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { SessionManager } from '../services/session-manager.js';

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
      mgrAny.inworldWs = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() };
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
      const mockInworldWs = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() };
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
      mgrAny.inworldWs = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() };
      mgrAny.sessionReady = false;

      mgr.triggerGreeting();

      expect((mgrAny.inworldWs as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled();
    });

    it('should use correct language name in greeting prompt', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-5',
        ws: clientWs,
        languageCode: 'de',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      const mockInworldWs = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() };
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
      mgrAny.inworldWs = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() };
      mgrAny.sessionReady = true;

      // Trigger greeting to set the greetingItemId
      mgr.triggerGreeting();
      const greetingId = mgrAny.greetingItemId as string;
      expect(greetingId).toBeTruthy();

      // Simulate the Inworld server echoing back the greeting item
      const handler = mgrAny.handleInworldEvent as (event: Record<string, unknown>) => void;
      handler.call(mgr, {
        type: 'conversation.item.done',
        item: {
          id: greetingId,
          role: 'user',
          content: [{ type: 'input_text', text: '[The student just joined...]' }],
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

      const handler = mgrAny.handleInworldEvent as (event: Record<string, unknown>) => void;
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

      const handler = mgrAny.handleInworldEvent as (event: Record<string, unknown>) => void;
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
    it('should accumulate transcription deltas incrementally', () => {
      const clientWs = createMockClientWs();
      const mgr = new SessionManager({
        sessionId: 'test-stt-1',
        ws: clientWs,
        languageCode: 'es',
      });

      const mgrAny = mgr as unknown as Record<string, unknown>;
      mgrAny.sessionReady = true;

      const handler = mgrAny.handleInworldEvent as (event: Record<string, unknown>) => void;

      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'Hola, ',
      });

      handler.call(mgr, {
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'me llamo Cale.',
      });

      const sent = (clientWs as unknown as { _messages: string[] })._messages;
      const partials = sent
        .map((m) => JSON.parse(m))
        .filter((m: Record<string, unknown>) => m.type === 'partial_transcript');
      expect(partials).toHaveLength(2);
      expect(partials[0].text).toBe('Hola, ');
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

      const handler = mgrAny.handleInworldEvent as (event: Record<string, unknown>) => void;

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
        .filter((m: Record<string, unknown>) => m.type === 'partial_transcript');
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

      const handler = mgrAny.handleInworldEvent as (event: Record<string, unknown>) => void;
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

      const handler = mgrAny.handleInworldEvent as (event: Record<string, unknown>) => void;
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
      const mockInworldWs = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() };
      mgrAny.inworldWs = mockInworldWs;

      // Call sendSessionUpdate directly
      const sendUpdate = mgrAny.sendSessionUpdate as () => void;
      sendUpdate.call(mgr);

      const sent = JSON.parse(mockInworldWs.send.mock.calls[0][0]);
      expect(sent.type).toBe('session.update');
      expect(sent.session.audio.input.transcription.model).toBe('assemblyai/u3-rt-pro');
      expect(sent.session.audio.input.transcription.language).toBe('es-MX');
      expect(sent.session.model).toBe('openai/gpt-4.1-nano');
    });
  });
});
