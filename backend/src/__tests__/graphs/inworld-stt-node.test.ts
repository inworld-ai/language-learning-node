/**
 * Unit tests for InworldSTTNode
 *
 * Mocks @inworld/runtime and @inworld/runtime/graph to avoid native bindings,
 * and mocks global fetch to exercise STT API logic without a live endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — factories must be self-contained (vi.mock is hoisted)
// ---------------------------------------------------------------------------
vi.mock('@inworld/runtime', () => {
  class DataStreamWithMetadata {
    stream: any;
    metadata: Record<string, any>;
    constructor(stream: any, metadata: Record<string, any> = {}) {
      this.stream = stream;
      this.metadata = metadata;
    }
    getMetadata() { return this.metadata; }
    toStream() { return this.stream; }
  }
  return { DataStreamWithMetadata };
});

vi.mock('@inworld/runtime/graph', () => {
  class CustomNode {
    id: string;
    constructor(props?: { id?: string }) {
      this.id = props?.id ?? 'mock-node';
    }
  }
  return { CustomNode, GraphTypes: {}, ProcessContext: class {} };
});

// ---------------------------------------------------------------------------
// Import the node under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import { InworldSTTNode } from '../../graphs/nodes/inworld-stt-node.js';

/** Shape of the mocked DataStreamWithMetadata returned by the node */
interface MockResult {
  stream: any;
  metadata: Record<string, any>;
}
import type { Connection, State } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    ws: {} as any,
    state: {
      interactionId: '',
      messages: [],
      userName: 'TestUser',
      targetLanguage: 'Spanish',
      languageCode: 'es',
      output_modalities: ['text'],
    } as State,
    ...overrides,
  };
}

function makeContext(sessionId: string) {
  return {
    getDatastore: () => ({
      get: (key: string) => (key === 'sessionId' ? sessionId : undefined),
    }),
  } as any;
}

/**
 * Build a PCM16-like Int16 frame simulating either speech or silence.
 * `amplitude` controls RMS: use 0.5 for speech, 0.0 for silence.
 */
function makeAudioChunk(amplitude = 0.5, samples = 1600): number[] {
  // Return float32-range numbers; audioDataToPCM16 will convert
  return Array.from({ length: samples }, () =>
    amplitude > 0 ? amplitude * (Math.random() < 0.5 ? 1 : -1) : 0
  );
}

/** Async generator that yields MultimodalContent-shaped objects */
async function* makeAudioStream(
  chunks: Array<{ audio?: { data: number[] }; text?: string }>
): AsyncIterableIterator<any> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function makeNode(
  connections: { [id: string]: Connection },
  sampleRate = 16000
) {
  return new InworldSTTNode({
    config: {
      apiKey: 'dGVzdDp0ZXN0', // base64 "test:test"
      connections,
      sampleRate,
      silenceThresholdMs: 300, // 3 silence chunks of 100 ms each
      minSpeechMs: 100, // 1 speech chunk minimum
      silenceEnergyThreshold: 0.01,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InworldSTTNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor validation
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('throws if apiKey is missing', () => {
      expect(
        () =>
          new InworldSTTNode({
            config: { apiKey: '', connections: {} },
          })
      ).toThrow('requires an API key');
    });

    it('throws if connections is missing', () => {
      expect(
        () =>
          new InworldSTTNode({
            config: { apiKey: 'key', connections: null as any },
          })
      ).toThrow('requires a connections object');
    });

    it('constructs successfully with valid config', () => {
      const node = makeNode({});
      expect(node).toBeInstanceOf(InworldSTTNode);
    });
  });

  // -------------------------------------------------------------------------
  // Text input — bypasses STT entirely
  // -------------------------------------------------------------------------
  describe('text input', () => {
    it('returns text transcript directly without calling fetch', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const sid = 'sess-text-1';
      const conn = makeConnection();
      const node = makeNode({ [sid]: conn });

      const stream = makeAudioStream([{ text: 'Hola mundo' }]);
      const result = (await node.process(
        makeContext(sid),
        stream,
        null as any
      )) as unknown as MockResult;

      expect(result.metadata.transcript).toBe('Hola mundo');
      expect(result.metadata.turn_detected).toBe(true);
      expect(result.metadata.is_text_input).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Audio — VAD end-of-turn detection
  // -------------------------------------------------------------------------
  describe('audio VAD', () => {
    it('detects end-of-turn after speech followed by silence', async () => {
      const sid = 'sess-vad-1';
      const conn = makeConnection();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          transcription: { transcript: 'Buenos días' },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const node = makeNode({ [sid]: conn });

      // 3 speech chunks + 3 silence chunks (triggers silenceThreshold=300ms=3 chunks)
      const chunks = [
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.5) },
        })),
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.0) },
        })),
      ];

      const stream = makeAudioStream(chunks);
      const result = (await node.process(
        makeContext(sid),
        stream,
        null as any
      )) as unknown as MockResult;

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result.metadata.transcript).toBe('Buenos días');
      expect(result.metadata.turn_detected).toBe(true);
    });

    it('discards noise shorter than minSpeechMs and returns no turn', async () => {
      const sid = 'sess-vad-noise';
      const conn = makeConnection();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      // minSpeechMs=100 → 1 chunk needed; give 0 speech chunks
      const node = makeNode({ [sid]: conn });

      // Only silence — stream exhausts with no speech at all
      const chunks = Array.from({ length: 5 }, () => ({
        audio: { data: makeAudioChunk(0.0) },
      }));

      const stream = makeAudioStream(chunks);
      const result = (await node.process(
        makeContext(sid),
        stream,
        null as any
      )) as unknown as MockResult;

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.metadata.turn_detected).toBe(false);
      expect(result.metadata.stream_exhausted).toBe(true);
    });

    it('calls onSpeechDetected callback when speech starts', async () => {
      const sid = 'sess-callback';
      const onSpeechDetected = vi.fn();
      const conn = makeConnection({ onSpeechDetected });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ transcription: { transcript: 'test' } }),
      }));

      const node = makeNode({ [sid]: conn });

      const chunks = [
        { audio: { data: makeAudioChunk(0.5) } },
        { audio: { data: makeAudioChunk(0.5) } },
        { audio: { data: makeAudioChunk(0.0) } },
        { audio: { data: makeAudioChunk(0.0) } },
        { audio: { data: makeAudioChunk(0.0) } },
      ];

      await node.process(makeContext(sid), makeAudioStream(chunks), null as any);

      expect(onSpeechDetected).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // STT API
  // -------------------------------------------------------------------------
  describe('callInworldSTT', () => {
    it('handles STT API error response gracefully', async () => {
      const sid = 'sess-err';
      const conn = makeConnection();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'invalid key',
      }));

      const node = makeNode({ [sid]: conn });

      const chunks = [
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.5) },
        })),
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.0) },
        })),
      ];

      const result = (await node.process(
        makeContext(sid),
        makeAudioStream(chunks),
        null as any
      )) as unknown as MockResult;

      expect(result.metadata.error_occurred).toBe(true);
      expect(result.metadata.error_message).toMatch(/401/);
      expect(result.metadata.turn_detected).toBe(false);
    });

    it('times out if fetch hangs (abort controller fires)', async () => {
      vi.useFakeTimers();

      const sid = 'sess-timeout';
      const conn = makeConnection();

      // fetch never resolves — simulates a hanging endpoint
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          (_url: string, opts: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts.signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            })
        )
      );

      const node = makeNode({ [sid]: conn });

      const chunks = [
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.5) },
        })),
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.0) },
        })),
      ];

      const processPromise = node.process(
        makeContext(sid),
        makeAudioStream(chunks),
        null as any
      );

      // Advance timers past the 15-second timeout
      await vi.advanceTimersByTimeAsync(16000);

      const result =
        (await processPromise) as unknown as MockResult;

      expect(result.metadata.error_occurred).toBe(true);
      expect(result.metadata.error_message).toMatch(/timed out/i);

      vi.useRealTimers();
    });

    it('stitches pendingTranscript with new transcript', async () => {
      const sid = 'sess-stitch';
      const conn = makeConnection({ pendingTranscript: 'Hola' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ transcription: { transcript: 'mundo' } }),
      }));

      const node = makeNode({ [sid]: conn });

      const chunks = [
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.5) },
        })),
        ...Array.from({ length: 3 }, () => ({
          audio: { data: makeAudioChunk(0.0) },
        })),
      ];

      const result = (await node.process(
        makeContext(sid),
        makeAudioStream(chunks),
        null as any
      )) as unknown as MockResult;

      expect(result.metadata.transcript).toBe('Hola mundo');
      expect(conn.pendingTranscript).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Session / connection edge cases
  // -------------------------------------------------------------------------
  describe('session validation', () => {
    it('throws if session is not found in connections map', async () => {
      const node = makeNode({}); // empty connections
      const stream = makeAudioStream([{ text: 'hi' }]);

      await expect(
        node.process(makeContext('unknown-session'), stream, null as any)
      ).rejects.toThrow('Failed to read connection');
    });

    it('throws if session is marked as unloaded', async () => {
      const sid = 'sess-unloaded';
      const conn = makeConnection({ unloaded: true });
      const node = makeNode({ [sid]: conn });
      const stream = makeAudioStream([{ text: 'hi' }]);

      await expect(
        node.process(makeContext(sid), stream, null as any)
      ).rejects.toThrow('Session unloaded');
    });
  });

  // -------------------------------------------------------------------------
  // Metadata fields on return value
  // -------------------------------------------------------------------------
  describe('return metadata', () => {
    it('includes expected metadata fields for a text turn', async () => {
      const sid = 'sess-meta';
      const conn = makeConnection();
      const node = makeNode({ [sid]: conn });

      const stream = makeAudioStream([{ text: 'Gracias' }]);
      const result = (await node.process(
        makeContext(sid),
        stream,
        null as any
      )) as unknown as MockResult;

      const m = result.metadata;
      expect(m).toHaveProperty('iteration');
      expect(m).toHaveProperty('interactionId');
      expect(m).toHaveProperty('session_id', sid);
      expect(m).toHaveProperty('transcript', 'Gracias');
      expect(m).toHaveProperty('turn_detected', true);
      expect(m).toHaveProperty('interaction_complete', true);
      expect(m).toHaveProperty('is_text_input', true);
      expect(m).toHaveProperty('text_content', 'Gracias');
      expect(m).toHaveProperty('error_occurred', false);
    });

    it('starts at iteration 1 for a fresh session', async () => {
      const sid = 'sess-iter';
      const conn = makeConnection();
      const node = makeNode({ [sid]: conn });

      const r1 = (await node.process(
        makeContext(sid),
        makeAudioStream([{ text: 'uno' }]),
        null as any
      )) as unknown as MockResult;

      expect(r1.metadata.iteration).toBe(1);
    });

    it('reads iteration from an existing interactionId containing #N', async () => {
      const sid = 'sess-iter-carry';
      // Simulate an interactionId left over from a previous incomplete turn
      const conn = makeConnection();
      conn.state.interactionId = 'some-uuid#3';
      const node = makeNode({ [sid]: conn });

      const result = (await node.process(
        makeContext(sid),
        makeAudioStream([{ text: 'tres' }]),
        null as any
      )) as unknown as MockResult;

      // Should continue from iteration 3 → 4
      expect(result.metadata.iteration).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------
  describe('destroy', () => {
    it('resolves without throwing', async () => {
      const node = makeNode({});
      await expect(node.destroy()).resolves.toBeUndefined();
    });
  });
});
