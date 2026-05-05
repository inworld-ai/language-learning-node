/**
 * WebSocket Handler — Inworld Realtime API
 *
 * Each client WebSocket gets a SessionManager that proxies
 * audio/text to Inworld Realtime (STT+LLM+TTS in one session).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import { SessionManager } from './session-manager.js';
import { InworldLLM } from './inworld-llm.js';
import {
  DEFAULT_LANGUAGE_CODE,
  getLanguageConfig,
} from '../config/languages.js';
import { serverLogger as logger } from '../utils/logger.js';

const sessions = new Map<string, SessionManager>();

export function setupWebSocketHandlers(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket) => {
    const sessionId = uuidv4();
    logger.info({ sessionId }, 'ws_connected');

    let manager: SessionManager | null = null;
    let sessionCreating: Promise<SessionManager> | null = null;
    let languageCode = DEFAULT_LANGUAGE_CODE;
    let greetingSent = false;
    const llm = new InworldLLM();
    const previousFeedback: string[] = [];

    async function ensureSession(): Promise<SessionManager> {
      if (manager) return manager;
      if (sessionCreating) return sessionCreating;

      sessionCreating = (async () => {
        manager = new SessionManager({ sessionId, ws, languageCode });
        sessions.set(sessionId, manager);

        // Wire up turn-complete callback for flashcards + feedback
        manager.onTurnComplete = (messages, userText, _assistantText) => {
          const langConfig = getLanguageConfig(languageCode);

          // Generate flashcard (fire-and-forget)
          llm
            .generateFlashcard(messages, langConfig.name)
            .then((card) => {
              if (card) {
                wsSend(ws, {
                  type: 'flashcards_generated',
                  flashcards: [card],
                });
              }
            })
            .catch((err) =>
              logger.warn({ err }, 'flashcard_generation_failed')
            );

          // Generate feedback on user's last utterance (fire-and-forget)
          llm
            .generateFeedback(
              messages,
              userText,
              langConfig.name,
              previousFeedback
            )
            .then((feedback) => {
              if (feedback) {
                previousFeedback.push(feedback);
                if (previousFeedback.length > 10) previousFeedback.shift();
                wsSend(ws, {
                  type: 'feedback_generated',
                  messageContent: userText,
                  feedback,
                });
              }
            })
            .catch((err) => logger.warn({ err }, 'feedback_generation_failed'));
        };

        await manager.start();
        logger.info({ sessionId, languageCode }, 'session_started');
        return manager;
      })();

      return sessionCreating;
    }

    ws.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'user_context': {
            languageCode = msg.languageCode || languageCode;
            const mgr = await ensureSession();
            if (msg.userId) mgr.setUserId(msg.userId);
            break;
          }

          case 'audio_chunk': {
            const mgr = await ensureSession();

            // Trigger greeting on first audio (mic enabled)
            if (!greetingSent) {
              greetingSent = true;
              mgr.triggerGreeting();
            }

            mgr.sendAudio(msg.audio_data);
            break;
          }

          case 'text_message': {
            if (msg.text) {
              const mgr = await ensureSession();
              mgr.sendText(msg.text);
            }
            break;
          }

          case 'tts_pronounce_request': {
            // Pronounce a word/phrase using Inworld TTS (for flashcard playback)
            if (msg.text) {
              const langConfig = getLanguageConfig(languageCode);
              const audio = await llm.pronounce(
                msg.text,
                langConfig.ttsConfig.speakerId,
                langConfig.bcp47,
                langConfig.ttsConfig.modelId
              );
              if (audio) {
                wsSend(ws, {
                  type: 'tts_pronounce_audio',
                  audio,
                  audioFormat: 'int16',
                  sampleRate: 24000,
                });
                wsSend(ws, { type: 'tts_pronounce_complete' });
              } else {
                wsSend(ws, {
                  type: 'tts_pronounce_error',
                  error: 'TTS pronunciation failed',
                });
              }
            }
            break;
          }

          case 'translate': {
            // Server-side translation via Inworld LLM
            if (msg.text && msg.targetLang) {
              const translation = await llm.translate(
                msg.text,
                msg.sourceLang || 'auto',
                msg.targetLang
              );
              wsSend(ws, {
                type: 'translation_result',
                originalText: msg.text,
                translation,
              });
            }
            break;
          }

          case 'conversation_switch': {
            if (manager) {
              const newLang = msg.languageCode || languageCode;
              languageCode = newLang;
              greetingSent = false;
              previousFeedback.length = 0;
              await manager.switchLanguage(newLang, msg.messages);
              wsSend(ws, {
                type: 'conversation_ready',
                conversationId: msg.conversationId,
                languageCode: newLang,
              });
            }
            break;
          }

          case 'conversation_context_reset': {
            if (manager) {
              greetingSent = false;
              previousFeedback.length = 0;
              await manager.switchLanguage(languageCode);
            }
            break;
          }

          case 'conversation_update': {
            if (manager && msg.messages) {
              manager.loadHistory(msg.messages);
            }
            break;
          }

          case 'ping':
            wsSend(ws, { type: 'pong' });
            break;

          default:
            logger.debug({ type: msg.type }, 'unknown_message_type');
        }
      } catch (err) {
        logger.error({ err, sessionId }, 'message_processing_error');
      }
    });

    ws.on('close', async () => {
      logger.info({ sessionId }, 'ws_disconnected');
      const mgr = sessions.get(sessionId);
      if (mgr) {
        await mgr.destroy();
        sessions.delete(sessionId);
      }
    });

    ws.on('error', (err) => {
      logger.error({ err, sessionId }, 'ws_error');
    });
  });
}

function wsSend(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
