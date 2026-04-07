/**
 * SessionManager — manages one Inworld Realtime WebSocket session per client.
 *
 * Uses raw WebSocket protocol to Inworld Realtime API (STT+LLM+TTS).
 * The @inworld/agents SDK has compatibility issues with session.update,
 * so we use the raw protocol which works reliably.
 *
 * Browser ↔ our WS ↔ SessionManager ↔ Inworld Realtime WS
 */

import WebSocket from 'ws';
import type { WebSocket as ClientWebSocket } from 'ws';

import { serverConfig } from '../config/server.js';
import { getLanguageConfig, type LanguageConfig } from '../config/languages.js';
import { createSessionLogger } from '../utils/logger.js';
import { TurnMemory } from './turn-memory.js';
import { getMemoryService } from './memory-service.js';

export interface SessionManagerOptions {
  sessionId: string;
  ws: ClientWebSocket;
  languageCode: string;
}

export class SessionManager {
  private ws: ClientWebSocket;
  private inworldWs: WebSocket | null = null;
  private langConfig: LanguageConfig;
  private logger: ReturnType<typeof createSessionLogger>;
  private memory: TurnMemory;
  private turnCount = 0;
  private conversationMessages: Array<{ role: string; content: string }> = [];
  private destroyed = false;
  private sessionReady = false;
  /** Item ID of the hidden greeting prompt — suppress from transcription output */
  private greetingItemId: string | null = null;
  /** Buffer for accumulating partial transcription deltas (incremental) */
  private userTextBuffer = '';

  constructor(opts: SessionManagerOptions) {
    this.ws = opts.ws;
    this.langConfig = getLanguageConfig(opts.languageCode);
    this.logger = createSessionLogger('SessionManager', opts.sessionId);
    this.memory = new TurnMemory(5);
    this.memory.setLanguageCode(opts.languageCode);
  }

  async start(): Promise<void> {
    const apiKey = process.env.INWORLD_API_KEY;
    if (!apiKey) throw new Error('INWORLD_API_KEY is required');

    const url = `${serverConfig.inworldRealtimeUrl}?key=voice-${Date.now()}&protocol=realtime`;

    return new Promise((resolve, reject) => {
      this.inworldWs = new WebSocket(url, {
        headers: { Authorization: `Basic ${apiKey}` },
      });

      this.inworldWs.on('open', () => {
        this.logger.info('inworld_ws_connected');
      });

      this.inworldWs.on('message', (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleInworldEvent(event, resolve);
        } catch (err) {
          this.logger.warn({ err }, 'inworld_message_parse_error');
        }
      });

      this.inworldWs.on('error', (err: Error) => {
        this.logger.error({ err: err.message }, 'inworld_ws_error');
        if (!this.sessionReady) reject(err);
      });

      this.inworldWs.on('close', (code: number, reason: Buffer) => {
        this.logger.info(
          { code, reason: reason.toString() },
          'inworld_ws_closed'
        );
        this.sessionReady = false;
      });
    });
  }

  /** Forward browser audio to Inworld */
  sendAudio(base64Audio: string): void {
    if (!this.inworldWs || !this.sessionReady || this.destroyed) return;

    this.inworldSend({
      type: 'input_audio_buffer.append',
      audio: base64Audio,
    });
  }

  /** Forward text message to Inworld */
  sendText(text: string): void {
    if (!this.inworldWs || !this.sessionReady || this.destroyed) return;

    this.trackUserMessage(text);

    this.inworldSend({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.inworldSend({ type: 'response.create' });
  }

  /**
   * Trigger the teacher to greet the student.
   * Called when the user enables their mic — sends a silent response.create
   * so the teacher speaks first in the target language.
   */
  triggerGreeting(): void {
    if (!this.inworldWs || !this.sessionReady || this.destroyed) return;
    if (this.turnCount > 0) return; // Only greet on first interaction

    // Inworld requires a user message before response.create.
    // Send a hidden prompt — we'll suppress it from transcription output.
    const itemId = `greeting-${Date.now()}`;
    this.greetingItemId = itemId;
    this.inworldSend({
      type: 'conversation.item.create',
      item: {
        id: itemId,
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `[The student just joined. Say hi in ${this.langConfig.name} — 1 sentence only.]`,
          },
        ],
      },
    });
    this.inworldSend({ type: 'response.create' });
  }

  /** Callback for when a conversation turn completes (user + assistant) */
  onTurnComplete:
    | ((
        messages: Array<{ role: string; content: string }>,
        userText: string,
        assistantText: string
      ) => void)
    | null = null;

  /** Set user ID for Supabase memory persistence */
  setUserId(userId: string): void {
    this.memory.setMemoryService(getMemoryService(), userId);
  }

  /** Load previous conversation history into memory */
  loadHistory(messages: Array<{ role: string; content: string }>): void {
    for (const msg of messages) {
      this.memory.add(msg.role, msg.content);
    }
    this.conversationMessages = [...messages];
  }

  /** Switch language — tears down session and reconnects */
  async switchLanguage(
    languageCode: string,
    messages?: Array<{ role: string; content: string }>
  ): Promise<void> {
    this.langConfig = getLanguageConfig(languageCode);
    this.conversationMessages = messages || [];
    this.turnCount = 0;
    this.memory.clear();
    this.memory.setLanguageCode(languageCode);

    for (const msg of this.conversationMessages) {
      this.memory.add(msg.role, msg.content);
    }

    await this.reconnect();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.sessionReady = false;
    if (this.inworldWs) {
      try {
        this.inworldWs.close();
      } catch {
        // ignore
      }
      this.inworldWs = null;
    }
    this.logger.info('session_destroyed');
  }

  // ── Private ──────────────────────────────────────────────

  private handleInworldEvent(
    event: Record<string, unknown>,
    onReady?: (value: void) => void
  ): void {
    const type = event.type as string;

    // Debug: log non-audio event types
    if (type !== 'response.output_audio.delta') {
      this.logger.debug({ eventType: type }, 'inworld_event');
    }

    switch (type) {
      case 'session.created':
        this.sendSessionUpdate();
        break;

      case 'session.updated':
        this.sessionReady = true;
        this.logger.info('session_ready');
        if (onReady) onReady();
        break;

      case 'input_audio_buffer.speech_started':
        // Cancel any in-progress agent response (matches Inworld playground)
        this.inworldSend({ type: 'response.cancel' });
        this.wsSend({ type: 'speech_detected', data: {} });
        this.wsSend({ type: 'interrupt', reason: 'speech_start' });
        break;

      case 'input_audio_buffer.speech_stopped':
        // No-op: keep partial transcript visible until final arrives
        break;

      case 'input_audio_buffer.committed':
        // No-op: wait for completed transcript
        break;

      case 'conversation.item.input_audio_transcription.delta': {
        // Deltas are INCREMENTAL — accumulate into buffer (matches Inworld playground)
        const partialDelta = event.delta as string;
        if (partialDelta) {
          this.userTextBuffer += partialDelta;
          this.wsSend({
            type: 'partial_transcript',
            text: this.userTextBuffer,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        // Final transcript — replace buffer content with authoritative final
        const completedText = event.transcript as string;
        if (completedText) {
          this.trackUserMessage(completedText);
          this.wsSend({
            type: 'transcription',
            text: completedText,
            timestamp: Date.now(),
          });
        }
        // Reset buffer for next utterance
        this.userTextBuffer = '';
        break;
      }

      case 'response.output_audio_transcript.delta': {
        const delta = event.delta as string;
        if (delta) {
          this.wsSend({
            type: 'llm_response_chunk',
            text: delta,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'response.output_audio.delta': {
        const audio = event.delta as string;
        if (audio) {
          this.wsSend({
            type: 'audio_stream',
            audio,
            audioFormat: 'int16',
            sampleRate: serverConfig.audio.outputSampleRate,
          });
        }
        break;
      }

      case 'response.output_audio_transcript.done': {
        const transcript = event.transcript as string;
        if (transcript) {
          this.trackAssistantMessage(transcript);
          this.wsSend({
            type: 'llm_response_complete',
            text: transcript,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'response.done':
        this.wsSend({ type: 'audio_stream_complete', timestamp: Date.now() });
        break;

      case 'conversation.item.done': {
        const item = event.item as Record<string, unknown> | undefined;
        if (!item) break;

        // Suppress the hidden greeting prompt from showing in chat
        if (this.greetingItemId && item.id === this.greetingItemId) {
          this.greetingItemId = null;
          break;
        }

        // Forward completed user transcriptions from text input only.
        // Audio transcriptions are already handled by the
        // input_audio_transcription.completed event — tracking them here
        // too would cause duplicate messages and inflated turn counts.
        if (item.role === 'user') {
          const content = item.content as
            | Array<{ type: string; text?: string; transcript?: string }>
            | undefined;
          if (content) {
            for (const part of content) {
              if (part.type === 'input_text' && part.text) {
                this.wsSend({
                  type: 'transcription',
                  text: part.text,
                  timestamp: Date.now(),
                });
              }
            }
          }
        }
        break;
      }

      case 'error': {
        this.logger.error({ event }, 'inworld_error_event');
        break;
      }
    }
  }

  private sendSessionUpdate(): void {
    const { teacherPersona, name, exampleTopics, ttsConfig, sttLanguageCode } =
      this.langConfig;
    const memoryContext = this.memory.getContext();

    let instructions = `# Context
- You are ${teacherPersona.name}, ${teacherPersona.description}.
- You are a ${name} tutor in a voice conversation app.

# Instructions
- Keep every response to 1 or 2 sentences max — this is a spoken conversation, not a lecture
- Greet the user briefly in ${name} (1-2 sentences max)
- If they don't want anything in particular, chat about ${exampleTopics.join(', ')}, or any topic
- Be natural — sometimes share about yourself instead of always asking questions
- Offer brief advice and feedback when the learner makes mistakes

# Communication Style
- Short, spoken-style sentences — never more than 2 sentences
- The user's speech comes via speech-to-text, so tolerate transcription errors
- Ask open-ended questions to get them practicing ${name}`;

    if (memoryContext) {
      instructions += `\n\n# Recent Conversation Context\n${memoryContext}`;
    }

    this.inworldSend({
      type: 'session.update',
      session: {
        model: 'openai/gpt-4.1-nano',
        instructions,
        output_modalities: ['audio', 'text'],
        audio: {
          input: {
            transcription: {
              model: 'assemblyai/u3-rt-pro',
              language: sttLanguageCode,
            },
            turn_detection: {
              type: 'semantic_vad',
              eagerness: serverConfig.vadEagerness,
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice: ttsConfig.speakerId,
            model: ttsConfig.modelId,
            speed: ttsConfig.speakingRate,
          },
        },
      },
    });
  }

  private trackUserMessage(text: string): void {
    this.conversationMessages.push({ role: 'user', content: text });
    this.memory.add('user', text);
    this.lastUserText = text;
    this.turnCount++;

    // Non-blocking: update instructions every 3 turns
    if (this.turnCount % 3 === 0) {
      this.sendSessionUpdate();
    }
  }

  private lastUserText = '';

  private trackAssistantMessage(text: string): void {
    this.conversationMessages.push({ role: 'assistant', content: text });
    this.memory.add('assistant', text);
    this.turnCount++;

    if (this.turnCount % 3 === 0) {
      this.sendSessionUpdate();
    }

    // Fire turn-complete callback for flashcard/feedback generation
    if (this.onTurnComplete && this.lastUserText) {
      this.onTurnComplete(
        [...this.conversationMessages],
        this.lastUserText,
        text
      );
      this.lastUserText = '';
    }
  }

  private async reconnect(): Promise<void> {
    await this.destroy();
    this.destroyed = false;
    await this.start();
  }

  private inworldSend(msg: Record<string, unknown>): void {
    if (this.inworldWs?.readyState === WebSocket.OPEN) {
      this.inworldWs.send(JSON.stringify(msg));
    }
  }

  private wsSend(msg: Record<string, unknown>): void {
    if (this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
