/**
 * WebSocket Handler
 *
 * Manages WebSocket connections and message processing.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { telemetry } from '@inworld/runtime';
import { GraphTypes } from '@inworld/runtime/graph';

import { ConnectionManager } from '../helpers/connection-manager.js';
import { convertAudioToBase64 } from '../helpers/audio-utils.js';
import { FlashcardProcessor } from '../helpers/flashcard-processor.js';
import { FeedbackProcessor } from '../helpers/feedback-processor.js';
import { MemoryProcessor } from '../helpers/memory-processor.js';
import {
  getSupportedLanguageCodes,
  DEFAULT_LANGUAGE_CODE,
} from '../config/languages.js';
import { serverLogger as logger } from '../utils/logger.js';
import { getSimpleTTSGraph } from '../graphs/simple-tts-graph.js';
import { serverConfig } from '../config/server.js';

import {
  connections,
  connectionManagers,
  flashcardProcessors,
  feedbackProcessors,
  memoryProcessors,
  connectionAttributes,
  isShuttingDown,
} from './state.js';
import { getGraphWrapper } from './graph-service.js';

export function setupWebSocketHandlers(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket) => {
    const graphWrapper = getGraphWrapper();
    if (!graphWrapper) {
      logger.error('graph_not_initialized_rejecting_connection');
      ws.close(1011, 'Server not ready');
      return;
    }

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    logger.info({ connectionId }, 'websocket_connected');

    // Default language is Spanish, but can be changed via conversation_switch
    const languageCode = DEFAULT_LANGUAGE_CODE;

    // Create connection manager (replaces AudioProcessor)
    const connectionManager = new ConnectionManager(
      connectionId,
      ws,
      graphWrapper,
      connections,
      languageCode
    );

    // Create flashcard processor
    const flashcardProcessor = new FlashcardProcessor(languageCode);

    // Create feedback processor
    const feedbackProcessor = new FeedbackProcessor(languageCode);

    // Create memory processor
    const memoryProcessor = new MemoryProcessor(languageCode);

    // Store processors
    connectionManagers.set(connectionId, connectionManager);
    flashcardProcessors.set(connectionId, flashcardProcessor);
    feedbackProcessors.set(connectionId, feedbackProcessor);
    memoryProcessors.set(connectionId, memoryProcessor);
    connectionAttributes.set(connectionId, {
      languageCode: languageCode,
    });

    // Set up flashcard generation callback
    // conversationId + languageCode are captured at trigger time, not read from mutable state
    connectionManager.setFlashcardCallback(
      async (messages, conversationId, languageCode) => {
        if (isShuttingDown()) {
          logger.debug(
            { connectionId },
            'skipping_flashcard_generation_shutting_down'
          );
          return;
        }

        try {
          const attrs = connectionAttributes.get(connectionId) || {};
          const userAttributes: Record<string, string> = {
            timezone: attrs.timezone || '',
          };

          const targetingKey = attrs.userId || connectionId;
          const userContext = {
            attributes: userAttributes,
            targetingKey,
          };

          const flashcards = await flashcardProcessor.generateFlashcards(
            messages,
            1,
            userContext,
            languageCode
          );
          if (flashcards.length > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'flashcards_generated',
                flashcards,
                conversationId: conversationId || null,
              })
            );
          }
        } catch (error) {
          if (!isShuttingDown()) {
            logger.error(
              { err: error, connectionId },
              'flashcard_generation_error'
            );
          }
        }
      }
    );

    // Set up feedback generation callback
    // conversationId is captured at trigger time, not read from mutable state
    connectionManager.setFeedbackCallback(
      async (messages, currentTranscript, conversationId, languageCode) => {
        if (isShuttingDown()) {
          logger.debug(
            { connectionId },
            'skipping_feedback_generation_shutting_down'
          );
          return;
        }

        try {
          const attrs = connectionAttributes.get(connectionId) || {};
          const userAttributes: Record<string, string> = {
            timezone: attrs.timezone || '',
          };

          const targetingKey = attrs.userId || connectionId;
          const userContext = {
            attributes: userAttributes,
            targetingKey,
          };

          const feedback = await feedbackProcessor.generateFeedback(
            messages,
            currentTranscript,
            userContext,
            languageCode
          );

          if (feedback && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'feedback_generated',
                messageContent: currentTranscript,
                feedback,
                conversationId: conversationId || null,
              })
            );
          }
        } catch (error) {
          if (!isShuttingDown()) {
            logger.error(
              { err: error, connectionId },
              'feedback_generation_error'
            );
          }
        }
      }
    );

    // Set up memory generation callback
    // conversationId is captured at trigger time (unused here but kept for consistency)
    connectionManager.setMemoryCallback(async (messages, _conversationId) => {
      if (isShuttingDown()) {
        return;
      }

      const attrs = connectionAttributes.get(connectionId) || {};
      const userId = attrs.userId;

      if (!userId) {
        // Can't create memories without a user ID
        return;
      }

      // Increment turn and check if we should create a memory
      memoryProcessor.incrementTurn();

      if (memoryProcessor.shouldCreateMemory()) {
        // Wait for memory creation to complete
        await memoryProcessor.createMemoryAsync(userId, messages);
      }
    });

    // Start the graph for this connection
    try {
      await connectionManager.start();
      logger.info({ connectionId }, 'graph_started');
    } catch (error) {
      logger.error({ err: error, connectionId }, 'graph_start_failed');
      ws.close(1011, 'Failed to start audio processing');
      return;
    }

    // Handle incoming messages
    ws.on('message', (data) => {
      handleMessage(connectionId, ws, connectionManager, data);
    });

    ws.on('error', (error) => {
      logger.error({ err: error, connectionId }, 'websocket_error');
    });

    ws.on('close', async () => {
      logger.info({ connectionId }, 'websocket_closed');

      // Clean up connection manager
      const manager = connectionManagers.get(connectionId);
      if (manager) {
        try {
          await manager.destroy();
        } catch (error) {
          logger.error(
            { err: error, connectionId },
            'connection_manager_destroy_error'
          );
        }
        connectionManagers.delete(connectionId);
      }

      // Clean up other processors
      flashcardProcessors.delete(connectionId);
      feedbackProcessors.delete(connectionId);
      memoryProcessors.delete(connectionId);
      connectionAttributes.delete(connectionId);
    });
  });
}

function handleMessage(
  connectionId: string,
  ws: WebSocket,
  connectionManager: ConnectionManager,
  data: Buffer | ArrayBuffer | Buffer[]
): void {
  try {
    const message = JSON.parse(data.toString());

    if (message.type === 'audio_chunk' && message.audio_data) {
      // Process audio chunk
      connectionManager.addAudioChunk(message.audio_data);
    } else if (message.type === 'reset_flashcards') {
      const processor = flashcardProcessors.get(connectionId);
      if (processor) {
        processor.reset();
      }
    } else if (message.type === 'conversation_context_reset') {
      // Reset backend state when switching conversations
      connectionManager.reset();
      flashcardProcessors.get(connectionId)?.reset();
      logger.info({ connectionId }, 'conversation_context_reset');
    } else if (message.type === 'conversation_update') {
      handleConversationUpdate(connectionId, connectionManager, message);
    } else if (message.type === 'conversation_switch') {
      handleConversationSwitch(connectionId, ws, connectionManager, message);
    } else if (message.type === 'user_context') {
      handleUserContext(connectionId, message);
    } else if (message.type === 'flashcard_clicked') {
      handleFlashcardClicked(connectionId, message);
    } else if (message.type === 'text_message') {
      handleTextMessage(connectionId, ws, connectionManager, message);
    } else if (message.type === 'tts_pronounce_request') {
      handleTTSPronounce(connectionId, ws, message);
    } else {
      logger.debug(
        { connectionId, messageType: message.type },
        'received_message'
      );
    }
  } catch (error) {
    logger.error({ err: error, connectionId }, 'message_processing_error');
  }
}

function handleConversationUpdate(
  connectionId: string,
  connectionManager: ConnectionManager,
  message: {
    conversationId?: string;
    data?: {
      conversationId?: string;
      messages?: Array<{ role: string; content: string; timestamp?: string }>;
    };
    messages?: Array<{ role: string; content: string; timestamp?: string }>;
  }
): void {
  const incomingConversationId =
    message.conversationId || message.data?.conversationId;
  const currentConversationId = connectionManager.getConversationId();

  if (
    incomingConversationId &&
    currentConversationId &&
    incomingConversationId !== currentConversationId
  ) {
    logger.info(
      {
        connectionId,
        incomingConversationId,
        currentConversationId,
      },
      'ignoring_stale_conversation_update'
    );
    return;
  }

  // Handle both formats: { data: { messages: [...] } } and { messages: [...] }
  const messages =
    message.messages ||
    message.data?.messages ||
    (message.data as any)?.messages;

  if (!messages || !Array.isArray(messages)) {
    logger.debug(
      {
        connectionId,
        hasData: !!message.data,
        hasMessages: !!message.messages,
      },
      'conversation_update_missing_or_invalid_messages'
    );
    return;
  }

  logger.info(
    { connectionId, messageCount: messages.length },
    'loading_conversation_history'
  );

  try {
    connectionManager.loadConversationHistory(messages);
    logger.info(
      { connectionId, messageCount: messages.length },
      'conversation_history_loaded'
    );
  } catch (error) {
    logger.error(
      { err: error, connectionId },
      'failed_to_load_conversation_history'
    );
  }
}

async function handleConversationSwitch(
  connectionId: string,
  ws: WebSocket,
  connectionManager: ConnectionManager,
  message: {
    conversationId?: string;
    languageCode?: string;
    messages?: Array<{ role: string; content: string; timestamp?: string }>;
    data?: {
      conversationId?: string;
      languageCode?: string;
      messages?: Array<{ role: string; content: string; timestamp?: string }>;
    };
  }
): Promise<void> {
  const conversationId = message.conversationId || message.data?.conversationId;
  const requestedLanguageCode =
    message.languageCode || message.data?.languageCode;
  const messages = message.messages || message.data?.messages;

  if (!conversationId || !requestedLanguageCode) {
    logger.warn(
      {
        connectionId,
        hasConversationId: !!conversationId,
        hasLanguageCode: !!requestedLanguageCode,
      },
      'conversation_switch_missing_required_fields'
    );
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Missing conversationId or languageCode',
        timestamp: Date.now(),
      })
    );
    return;
  }

  if (!messages || !Array.isArray(messages)) {
    logger.warn({ connectionId }, 'conversation_switch_missing_messages');
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Missing messages array',
        timestamp: Date.now(),
      })
    );
    return;
  }

  // Validate language code
  const supportedCodes = getSupportedLanguageCodes();
  const languageCode = supportedCodes.includes(requestedLanguageCode)
    ? requestedLanguageCode
    : DEFAULT_LANGUAGE_CODE;

  if (requestedLanguageCode !== languageCode) {
    logger.warn(
      {
        connectionId,
        requestedCode: requestedLanguageCode,
        fallback: languageCode,
      },
      'invalid_language_code_using_fallback'
    );
  }

  logger.info(
    {
      connectionId,
      conversationId,
      languageCode,
      messageCount: messages.length,
    },
    'conversation_switch_requested'
  );

  try {
    // Switch conversation (waits for pending operations FIRST)
    // This ensures any flashcard/feedback generation in progress uses the OLD language
    // Returns false if another switch is already in progress
    const switched = await connectionManager.switchConversation(
      conversationId,
      languageCode,
      messages
    );

    if (!switched) {
      // Another switch is in progress - don't update processors or send ready signal
      // The in-progress switch will complete and send its own conversation_ready
      logger.warn(
        { connectionId, conversationId, languageCode },
        'conversation_switch_rejected_already_switching'
      );
      return;
    }

    // Update processors with new language AFTER pending operations complete
    // This ensures flashcard generation for the old conversation uses the old language
    const flashcardProcessor = flashcardProcessors.get(connectionId);
    const feedbackProcessor = feedbackProcessors.get(connectionId);
    const memoryProcessor = memoryProcessors.get(connectionId);

    if (flashcardProcessor) {
      flashcardProcessor.setLanguage(languageCode);
    }
    if (feedbackProcessor) {
      feedbackProcessor.setLanguage(languageCode);
      feedbackProcessor.reset();
    }
    if (memoryProcessor) {
      memoryProcessor.setLanguage(languageCode);
    }

    // Send ready signal
    ws.send(
      JSON.stringify({
        type: 'conversation_ready',
        conversationId,
        languageCode,
        timestamp: Date.now(),
      })
    );

    logger.info(
      { connectionId, conversationId, languageCode },
      'conversation_switch_complete'
    );
  } catch (error) {
    logger.error(
      { err: error, connectionId, conversationId },
      'conversation_switch_error'
    );
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Failed to switch conversation',
        timestamp: Date.now(),
      })
    );
  }
}

function handleUserContext(
  connectionId: string,
  message: {
    timezone?: string;
    userId?: string | null;
    languageCode?: string;
    data?: { timezone?: string; userId?: string | null; languageCode?: string };
  }
): void {
  const timezone = message.timezone || message.data?.timezone;
  const userId = message.userId || message.data?.userId;
  const languageCode = message.languageCode || message.data?.languageCode;
  const currentAttrs = connectionAttributes.get(connectionId) || {};

  // Validate language code
  const supportedCodes = getSupportedLanguageCodes();
  const validatedLanguageCode =
    languageCode && supportedCodes.includes(languageCode)
      ? languageCode
      : currentAttrs.languageCode || DEFAULT_LANGUAGE_CODE;

  connectionAttributes.set(connectionId, {
    ...currentAttrs,
    timezone: timezone || currentAttrs.timezone,
    userId: userId || currentAttrs.userId,
    languageCode: validatedLanguageCode,
  });

  // Update connection manager and processors with the language
  const manager = connectionManagers.get(connectionId);
  if (manager && validatedLanguageCode !== currentAttrs.languageCode) {
    manager.setLanguage(validatedLanguageCode);

    // Update processors with new language
    const flashcardProcessor = flashcardProcessors.get(connectionId);
    const feedbackProcessor = feedbackProcessors.get(connectionId);
    const memoryProcessor = memoryProcessors.get(connectionId);

    if (flashcardProcessor) {
      flashcardProcessor.setLanguage(validatedLanguageCode);
    }
    if (feedbackProcessor) {
      feedbackProcessor.setLanguage(validatedLanguageCode);
    }
    if (memoryProcessor) {
      memoryProcessor.setLanguage(validatedLanguageCode);
    }
  }

  // Set user ID on connection manager for memory retrieval
  if (userId && manager) {
    manager.setUserId(userId);
  }
}

function handleFlashcardClicked(
  connectionId: string,
  message: {
    card?: {
      id?: string;
      targetWord?: string;
      spanish?: string;
      word?: string;
      english?: string;
      translation?: string;
    };
  }
): void {
  const card = message.card;
  if (!card || typeof card !== 'object') {
    logger.debug({ connectionId }, 'flashcard_clicked_missing_card_data');
    return;
  }
  try {
    const attrs = connectionAttributes.get(connectionId) || {};
    telemetry.metric.recordCounterUInt('flashcard_clicks_total', 1, {
      connectionId,
      cardId: card.id || '',
      targetWord: card.targetWord || card.spanish || card.word || '',
      english: card.english || card.translation || '',
      source: 'ui',
      timezone: attrs.timezone || '',
      languageCode: attrs.languageCode || DEFAULT_LANGUAGE_CODE,
    });
  } catch (error) {
    logger.error({ err: error, connectionId }, 'flashcard_click_record_error');
  }
}

function handleTextMessage(
  connectionId: string,
  ws: WebSocket,
  connectionManager: ConnectionManager,
  message: { text?: string }
): void {
  const text = message.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    logger.debug({ connectionId }, 'empty_or_invalid_text_message_ignored');
    return;
  }
  if (text.length > 200) {
    logger.warn({ connectionId, length: text.length }, 'text_message_too_long');
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Text message too long (max 200 chars)',
      })
    );
    return;
  }
  connectionManager.sendTextMessage(text.trim());
}

async function handleTTSPronounce(
  connectionId: string,
  ws: WebSocket,
  message: { text?: string; languageCode?: string }
): Promise<void> {
  const text = message.text;

  if (typeof text !== 'string' || text.trim().length === 0) {
    ws.send(
      JSON.stringify({ type: 'tts_pronounce_error', error: 'Empty text' })
    );
    return;
  }

  if (text.length > 100) {
    logger.warn(
      { connectionId, length: text.length },
      'tts_pronounce_text_too_long'
    );
    ws.send(
      JSON.stringify({ type: 'tts_pronounce_error', error: 'Text too long' })
    );
    return;
  }

  try {
    // Get language from connection manager (current conversation language)
    const connectionManager = connectionManagers.get(connectionId);
    const languageCode =
      connectionManager?.getLanguageCode() ||
      message.languageCode ||
      DEFAULT_LANGUAGE_CODE;

    logger.debug(
      { connectionId, languageCode, textLength: text.length },
      'tts_pronounce_starting'
    );

    const graph = getSimpleTTSGraph(languageCode);
    const executionResult = await graph.start({ text: text.trim() });

    for await (const res of executionResult.outputStream) {
      if ('processResponse' in res) {
        const resultWithProcess = res as {
          processResponse: (
            handlers: Record<string, (data: unknown) => Promise<void> | void>
          ) => Promise<void>;
        };
        await resultWithProcess.processResponse({
          TTSOutputStream: async (ttsData: unknown) => {
            const ttsStream = ttsData as GraphTypes.TTSOutputStream;
            for await (const chunk of ttsStream) {
              if (chunk.audio?.data) {
                const audioResult = convertAudioToBase64(chunk.audio);
                if (audioResult) {
                  ws.send(
                    JSON.stringify({
                      type: 'tts_pronounce_audio',
                      audio: audioResult.base64,
                      audioFormat: audioResult.format,
                      sampleRate:
                        chunk.audio.sampleRate ||
                        serverConfig.audio.ttsSampleRate,
                    })
                  );
                }
              }
            }
          },
        });
      }
    }

    ws.send(JSON.stringify({ type: 'tts_pronounce_complete' }));
  } catch (error) {
    logger.error({ err: error, connectionId }, 'tts_pronounce_error');
    ws.send(
      JSON.stringify({ type: 'tts_pronounce_error', error: 'TTS failed' })
    );
  }
}
