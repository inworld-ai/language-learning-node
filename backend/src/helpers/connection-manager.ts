/**
 * ConnectionManager - Manages WebSocket connections and graph execution
 *
 * This replaces the AudioProcessor for Inworld Runtime 0.9.
 * Key differences from AudioProcessor:
 * - Uses MultimodalStreamManager to feed audio to a long-running graph
 * - VAD is handled inside the graph by InworldSTTNode (energy-based silence detection)
 * - Graph runs continuously for the session duration
 */

import { WebSocket } from 'ws';
import { GraphTypes } from '@inworld/runtime/graph';

import { ConversationGraphWrapper } from '../graphs/conversation-graph.js';
import { MultimodalStreamManager } from './multimodal-stream-manager.js';
import { decodeBase64ToFloat32, convertAudioToBase64 } from './audio-utils.js';
import { ConnectionsMap } from '../types/index.js';
import {
  getLanguageConfig,
  DEFAULT_LANGUAGE_CODE,
  LanguageConfig,
} from '../config/languages.js';
import { serverConfig } from '../config/server.js';
import { createSessionLogger } from '../utils/logger.js';

const RECENT_MESSAGES_FOR_FLASHCARDS = 6;
const RECENT_MESSAGES_FOR_MEMORY = 10;

export class ConnectionManager {
  private sessionId: string;
  private ws: WebSocket;
  private graphWrapper: ConversationGraphWrapper;
  private multimodalStreamManager: MultimodalStreamManager;
  private connections: ConnectionsMap;
  private graphExecution: Promise<void> | null = null;
  private isDestroyed = false;
  private languageCode: string;
  private languageConfig: LanguageConfig;
  private logger: ReturnType<typeof createSessionLogger>;
  private conversationId: string | null = null;
  private pendingFlashcardGeneration: Promise<void> | null = null;
  private pendingFeedbackGeneration: Promise<void> | null = null;
  private pendingMemoryGeneration: Promise<void> | null = null;
  private isSwitchingConversation: boolean = false;
  private restartAttempts = 0;
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private lastRestartTime = 0;
  private readonly RESTART_COOLDOWN_MS = 5000; // Prevent rapid restart loops
  private readonly RESTART_RESET_THRESHOLD_MS = 30000; // Reset attempts after stable operation

  // Callback for flashcard processing (conversationId + languageCode captured at trigger time)
  private flashcardCallback:
    | ((
        messages: Array<{ role: string; content: string }>,
        conversationId: string | null,
        languageCode: string
      ) => Promise<void>)
    | null = null;

  // Callback for feedback generation (conversationId + languageCode captured at trigger time)
  private feedbackCallback:
    | ((
        messages: Array<{ role: string; content: string }>,
        currentTranscript: string,
        conversationId: string | null,
        languageCode: string
      ) => Promise<void>)
    | null = null;

  // Callback for memory creation (conversationId captured at trigger time)
  private memoryCallback:
    | ((
        messages: Array<{ role: string; content: string }>,
        conversationId: string | null
      ) => Promise<void>)
    | null = null;

  // User ID for memory retrieval/creation
  private userId: string | undefined = undefined;

  // Processing state tracking for utterance stitching
  private isProcessingResponse: boolean = false;
  private currentTranscript: string = '';

  // Snapshots captured when processing started, used to detect stale triggers
  // and to ensure flashcard/feedback generation uses the correct language
  private processingConversationId: string | null = null;
  private processingLanguageCode: string | null = null;

  constructor(
    sessionId: string,
    ws: WebSocket,
    graphWrapper: ConversationGraphWrapper,
    connections: ConnectionsMap,
    languageCode: string = DEFAULT_LANGUAGE_CODE
  ) {
    this.sessionId = sessionId;
    this.ws = ws;
    this.graphWrapper = graphWrapper;
    this.connections = connections;
    // Default language is Spanish, but can be changed via conversation_switch
    this.languageCode = languageCode;
    this.languageConfig = getLanguageConfig(languageCode);
    this.multimodalStreamManager = new MultimodalStreamManager();
    this.logger = createSessionLogger('ConnectionManager', sessionId);

    // Initialize connection state
    this.connections[sessionId] = {
      ws: ws,
      state: {
        interactionId: '',
        messages: [],
        userName: '',
        targetLanguage: this.languageConfig.name,
        languageCode: this.languageCode,
        voiceId: this.languageConfig.ttsConfig.speakerId,
        output_modalities: ['audio', 'text'],
        conversationId: undefined,
      },
      multimodalStreamManager: this.multimodalStreamManager,
      onSpeechDetected: (interactionId) =>
        this.handleSpeechDetected(interactionId),
      onPartialTranscript: (text, interactionId) =>
        this.handlePartialTranscript(text, interactionId),
    };

    this.logger.info(
      { language: this.languageConfig.name },
      'connection_manager_created'
    );
  }

  /**
   * Start the long-running graph execution
   */
  async start(): Promise<void> {
    this.logger.info('starting_graph');

    // Create the multimodal stream generator
    const multimodalStream = this.createMultimodalStreamGenerator();

    // Start graph execution (runs in background)
    this.graphExecution = this.executeGraph(multimodalStream);

    // Don't await - the graph runs continuously
    this.graphExecution.catch((error) => {
      if (!this.isDestroyed) {
        this.logger.error({ err: error }, 'graph_execution_error');
      }
    });
  }

  /**
   * Create an async generator that yields multimodal content from the stream manager
   */
  private async *createMultimodalStreamGenerator(): AsyncGenerator<GraphTypes.MultimodalContent> {
    for await (const content of this.multimodalStreamManager.createStream()) {
      yield content;
    }
  }

  /**
   * Execute the graph with the multimodal stream
   */
  private async executeGraph(
    stream: AsyncGenerator<GraphTypes.MultimodalContent>
  ): Promise<void> {
    const connection = this.connections[this.sessionId];
    if (!connection) {
      throw new Error(`No connection found for session ${this.sessionId}`);
    }

    // Tag the stream for the runtime
    const taggedStream = Object.assign(stream, {
      type: 'MultimodalContent',
    });

    this.logger.info('graph_execution_started');

    // Build dataStoreContent - only include userId if defined
    const dataStoreContent: Record<string, unknown> = {
      sessionId: this.sessionId,
      state: connection.state,
    };
    if (this.userId) {
      dataStoreContent.userId = this.userId;
    }

    const { outputStream } = await this.graphWrapper.graph.start(taggedStream, {
      executionId: this.sessionId,
      dataStoreContent,
      userContext: {
        attributes: {
          languageCode: this.languageCode,
          language: this.languageConfig.name,
        },
        targetingKey: this.sessionId,
      },
    });

    // Store the output stream for potential cancellation
    connection.currentAudioExecutionStream = outputStream;

    // Process graph outputs
    try {
      for await (const result of outputStream) {
        if (this.isDestroyed) break;
        await this.processGraphOutput(result);
      }
    } catch (error) {
      if (!this.isDestroyed) {
        this.logger.error({ err: error }, 'output_processing_error');
      }
    } finally {
      connection.currentAudioExecutionStream = undefined;
    }

    this.logger.info('graph_execution_completed');

    // Auto-restart if the graph completed but we weren't destroyed
    // This handles timeout scenarios (DEADLINE_EXCEEDED) gracefully
    if (!this.isDestroyed) {
      await this.handleGraphCompletion();
    }
  }

  /**
   * Handle unexpected graph completion by restarting
   */
  private async handleGraphCompletion(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRestart = now - this.lastRestartTime;

    // Reset restart attempts if enough time has passed (successful operation)
    if (timeSinceLastRestart > this.RESTART_RESET_THRESHOLD_MS) {
      this.restartAttempts = 0;
    }

    // Check if we should attempt restart
    if (this.restartAttempts >= this.MAX_RESTART_ATTEMPTS) {
      this.logger.warn(
        { attempts: this.restartAttempts },
        'max_restart_attempts_reached'
      );
      this.sendToClient({
        type: 'error',
        message:
          'Connection lost. Please refresh the page to continue the conversation.',
        code: 'GRAPH_RESTART_FAILED',
        timestamp: Date.now(),
      });
      return;
    }

    // Cooldown check to prevent rapid restart loops
    if (timeSinceLastRestart < this.RESTART_COOLDOWN_MS) {
      this.logger.debug(
        { cooldownMs: this.RESTART_COOLDOWN_MS - timeSinceLastRestart },
        'restart_cooldown_active'
      );
      await new Promise((resolve) =>
        setTimeout(resolve, this.RESTART_COOLDOWN_MS - timeSinceLastRestart)
      );
    }

    this.restartAttempts++;
    this.lastRestartTime = Date.now();

    this.logger.info(
      { attempt: this.restartAttempts },
      'auto_restarting_graph_after_timeout'
    );

    // Create a fresh multimodal stream manager
    this.multimodalStreamManager = new MultimodalStreamManager();

    // Update the connection's reference to the new stream manager
    const connection = this.connections[this.sessionId];
    if (connection) {
      connection.multimodalStreamManager = this.multimodalStreamManager;
    }

    // Notify client that we're recovering
    this.sendToClient({
      type: 'connection_recovered',
      message: 'Connection restored after idle timeout.',
      timestamp: Date.now(),
    });

    // Restart graph execution
    const multimodalStream = this.createMultimodalStreamGenerator();
    this.graphExecution = this.executeGraph(multimodalStream);

    this.graphExecution.catch((error) => {
      if (!this.isDestroyed) {
        this.logger.error({ err: error }, 'graph_restart_error');
      }
    });
  }

  /**
   * Process a single output from the graph
   */
  private async processGraphOutput(result: unknown): Promise<void> {
    const connection = this.connections[this.sessionId];
    if (!connection) return;

    let transcription = '';
    let llmResponse = '';

    try {
      // Cast to any to work around strict typing issues with processResponse handlers
      // The handlers receive typed data at runtime even though the type system says unknown
      const resultWithProcess = result as {
        processResponse: (
          handlers: Record<string, (data: unknown) => Promise<void> | void>
        ) => Promise<void>;
      };
      await resultWithProcess.processResponse({
        // Handle string output (transcription from proxy node)
        string: (data: unknown) => {
          transcription = String(data);
          if (transcription.trim()) {
            this.logger.debug({ transcription }, 'transcription_received');
            this.sendToClient({
              type: 'transcription',
              text: transcription.trim(),
              conversationId: this.conversationId,
              timestamp: Date.now(),
            });
          }
        },

        // Handle Custom data (transcription from transcript extractor)
        // InteractionInfo has: sessionId, interactionId, text, interactionComplete
        Custom: async (customData: unknown) => {
          const data = customData as {
            text?: string;
            interactionId?: string;
            interactionComplete?: boolean;
          };
          // Only send final transcriptions (interactionComplete=true) to avoid duplicates
          if (data.text && data.interactionComplete) {
            transcription = data.text;
            this.logger.debug({ transcription }, 'transcription_final');

            // Mark start of response processing for utterance stitching
            this.markProcessingStart(transcription);

            this.sendToClient({
              type: 'transcription',
              text: transcription.trim(),
              conversationId: this.conversationId,
              timestamp: Date.now(),
            });
          }
        },

        // Handle LLM response stream
        ContentStream: async (streamData: unknown) => {
          const stream = streamData as GraphTypes.ContentStream;
          this.logger.debug('processing_llm_content_stream');
          // Use array + join instead of string concatenation for O(n) vs O(n²)
          const responseChunks: string[] = [];
          let wasInterrupted = false;

          for await (const chunk of stream) {
            if (this.isDestroyed) break;

            // Check for interruption (user started speaking again for continuation)
            if (connection.isProcessingInterrupted) {
              this.logger.debug('llm_stream_interrupted_for_continuation');
              wasInterrupted = true;
              break;
            }

            if (chunk.text) {
              responseChunks.push(chunk.text);
              this.sendToClient({
                type: 'llm_response_chunk',
                text: chunk.text,
                conversationId: this.conversationId,
                timestamp: Date.now(),
              });
            }
          }

          // Only send completion if not interrupted
          if (!wasInterrupted) {
            const currentResponse = responseChunks.join('');
            if (currentResponse.trim()) {
              llmResponse = currentResponse;
              this.logger.debug(
                { responseSnippet: llmResponse.substring(0, 50) },
                'llm_response_complete'
              );
              this.sendToClient({
                type: 'llm_response_complete',
                text: llmResponse.trim(),
                conversationId: this.conversationId,
                timestamp: Date.now(),
              });
            }
          } else {
            this.logger.debug('llm_stream_interrupted_skipping_completion');
          }
        },

        // Handle TTS output stream
        TTSOutputStream: async (ttsData: unknown) => {
          const ttsStream = ttsData as GraphTypes.TTSOutputStream;
          this.logger.debug('processing_tts_stream');
          let isFirstChunk = true;
          let wasInterrupted = false;

          for await (const chunk of ttsStream) {
            if (this.isDestroyed) break;

            // Check for interruption (user started speaking again for continuation)
            if (connection.isProcessingInterrupted) {
              this.logger.debug('tts_interrupted_for_continuation');
              wasInterrupted = true;
              break;
            }

            if (chunk.audio?.data) {
              // Log sample rate on first chunk
              if (isFirstChunk) {
                this.logger.debug(
                  {
                    sampleRate:
                      chunk.audio.sampleRate ||
                      serverConfig.audio.ttsSampleRate,
                    bytes: Array.isArray(chunk.audio.data)
                      ? chunk.audio.data.length
                      : 'N/A',
                  },
                  'tts_audio_chunk'
                );
              }

              // Block audio during conversation switch
              if (this.isSwitchingConversation) {
                this.logger.debug('blocking_audio_during_conversation_switch');
                continue;
              }

              // Convert audio to base64 for WebSocket transmission
              // Use ttsSampleRate as fallback (not inputSampleRate which is for microphone input)
              const audioResult = convertAudioToBase64(chunk.audio);
              if (audioResult) {
                this.sendToClient({
                  type: 'audio_stream',
                  audio: audioResult.base64,
                  audioFormat: audioResult.format,
                  sampleRate:
                    chunk.audio.sampleRate || serverConfig.audio.ttsSampleRate,
                  text: chunk.text || '',
                  isFirstChunk: isFirstChunk,
                  conversationId: this.conversationId,
                  timestamp: Date.now(),
                });
                isFirstChunk = false;
              }
            }
          }

          // Only send completion signals if not interrupted
          if (!wasInterrupted) {
            // Send completion signals
            if (!this.isSwitchingConversation) {
              this.logger.debug('tts_stream_complete');
              this.sendToClient({
                type: 'audio_stream_complete',
                conversationId: this.conversationId,
                timestamp: Date.now(),
              });

              // Send conversation update with conversationId
              this.sendToClient({
                type: 'conversation_update',
                messages: connection.state.messages,
                conversationId: this.conversationId,
                timestamp: Date.now(),
              });
            }

            // Trigger flashcard, feedback, and memory generation after TTS completes
            this.triggerFlashcardGeneration();
            this.triggerFeedbackGeneration();
            this.triggerMemoryGeneration();
          } else {
            this.logger.debug('tts_interrupted_skipping_completion');
          }
          this.markProcessingComplete();
        },

        // Handle errors
        error: async (error: unknown) => {
          const err = error as { message?: string };
          this.logger.error({ err }, 'graph_error');
          if (!err.message?.includes('recognition produced no text')) {
            this.sendToClient({
              type: 'error',
              message: err.message || 'Unknown error',
              timestamp: Date.now(),
            });
          }
        },

        // Default handler for unknown types
        default: (_data: unknown) => {
          // Ignore unknown output types
        },
      });
    } catch (error) {
      this.logger.error({ err: error }, 'graph_output_processing_error');
    }
  }

  /**
   * Add an audio chunk from the WebSocket
   */
  addAudioChunk(base64Audio: string): void {
    if (this.isDestroyed) return;

    try {
      // Decode base64 to Float32Array
      const float32Data = decodeBase64ToFloat32(base64Audio);

      // Push to multimodal stream - pass Float32Array directly,
      // MultimodalStreamManager will handle conversion when needed
      this.multimodalStreamManager.pushAudio({
        data: float32Data,
        sampleRate: serverConfig.audio.inputSampleRate,
      });
    } catch (error) {
      this.logger.error({ err: error }, 'audio_chunk_error');
    }
  }

  /**
   * Handle speech detected event from Inworld STT
   */
  private handleSpeechDetected(interactionId: string): void {
    this.logger.debug({ interactionId }, 'speech_detected');

    // Check if we're currently processing a response - if so, this is a continuation
    if (this.isProcessingResponse && this.currentTranscript) {
      this.logger.debug('new_speech_during_processing_interrupting');
      this.interruptForContinuation(this.currentTranscript);

      // Send interrupt signal with continuation reason so frontend discards partial response
      this.sendToClient({
        type: 'interrupt',
        reason: 'continuation_detected',
        conversationId: this.conversationId,
        timestamp: Date.now(),
      });
    } else {
      // Normal case - send regular interrupt signal
      this.sendToClient({
        type: 'interrupt',
        reason: 'speech_start',
        conversationId: this.conversationId,
        timestamp: Date.now(),
      });
    }

    // Always send speech_detected for UI feedback
    this.sendToClient({
      type: 'speech_detected',
      interactionId,
      data: { text: '' },
      conversationId: this.conversationId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle partial transcript from Inworld STT
   */
  private handlePartialTranscript(text: string, interactionId: string): void {
    this.sendToClient({
      type: 'partial_transcript',
      text,
      interactionId,
      conversationId: this.conversationId,
      timestamp: Date.now(),
    });
  }

  /**
   * Interrupt current processing for utterance continuation/stitching.
   * Called when user starts speaking again while we're processing the first utterance.
   */
  private interruptForContinuation(partialTranscript: string): void {
    const connection = this.connections[this.sessionId];
    if (connection) {
      connection.isProcessingInterrupted = true;
      connection.pendingTranscript = partialTranscript;
      this.logger.debug(
        { transcriptSnippet: partialTranscript.substring(0, 50) },
        'interrupting_for_continuation'
      );

      // Remove the last user message and any assistant response that was added
      // before the continuation was detected
      const messages = connection.state.messages;
      let removedCount = 0;

      // Remove the last assistant message if it exists (the interrupted response)
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === 'assistant'
      ) {
        const removed = messages.pop();
        removedCount++;
        this.logger.debug(
          { contentSnippet: removed?.content.substring(0, 50) },
          'removed_interrupted_assistant_message'
        );
      }

      // Remove the last user message (the partial utterance that will be stitched)
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user'
      ) {
        const removed = messages.pop();
        removedCount++;
        this.logger.debug(
          { contentSnippet: removed?.content.substring(0, 50) },
          'removed_partial_user_message'
        );
      }

      // Notify frontend to update its conversation history
      if (removedCount > 0) {
        this.sendToClient({
          type: 'conversation_rollback',
          removedCount,
          messages: messages,
          conversationId: this.conversationId,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Mark the start of response processing (LLM/TTS)
   */
  private markProcessingStart(transcript: string): void {
    this.isProcessingResponse = true;
    this.currentTranscript = transcript;
    this.processingConversationId = this.conversationId;
    this.processingLanguageCode = this.languageCode;
  }

  /**
   * Mark the end of response processing
   */
  private markProcessingComplete(): void {
    this.isProcessingResponse = false;
    this.currentTranscript = '';
  }

  /**
   * Send message to WebSocket client
   */
  private sendToClient(message: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.logger.error({ err: error }, 'send_to_client_error');
      }
    }
  }

  /**
   * Trigger flashcard generation
   */
  private triggerFlashcardGeneration(): void {
    if (!this.flashcardCallback) return;
    if (this.conversationId !== this.processingConversationId) {
      this.logger.info('skipping_flashcard_generation_conversation_changed');
      return;
    }

    const connection = this.connections[this.sessionId];
    if (!connection) return;

    // Capture state now - don't rely on reading mutable fields after async work
    const snapshotConversationId = this.processingConversationId;
    const snapshotLanguageCode =
      this.processingLanguageCode || this.languageCode;

    const recentMessages = connection.state.messages
      .slice(-RECENT_MESSAGES_FOR_FLASHCARDS)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Track pending flashcard generation
    this.pendingFlashcardGeneration = this.flashcardCallback(
      recentMessages,
      snapshotConversationId,
      snapshotLanguageCode
    )
      .catch((error) => {
        this.logger.error({ err: error }, 'flashcard_generation_trigger_error');
      })
      .finally(() => {
        this.pendingFlashcardGeneration = null;
      });
  }

  /**
   * Trigger feedback generation for the user's last utterance
   */
  private triggerFeedbackGeneration(): void {
    if (!this.feedbackCallback) return;
    if (this.conversationId !== this.processingConversationId) {
      this.logger.info('skipping_feedback_generation_conversation_changed');
      return;
    }

    const connection = this.connections[this.sessionId];
    if (!connection) return;

    // Find the last user message
    const messages = connection.state.messages;
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'user');

    if (!lastUserMessage) return;

    // Capture state now - don't rely on reading mutable fields after async work
    const snapshotConversationId = this.processingConversationId;
    const snapshotLanguageCode =
      this.processingLanguageCode || this.languageCode;

    const recentMessages = messages
      .slice(-RECENT_MESSAGES_FOR_FLASHCARDS)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Track pending feedback generation
    this.pendingFeedbackGeneration = this.feedbackCallback(
      recentMessages,
      lastUserMessage.content,
      snapshotConversationId,
      snapshotLanguageCode
    )
      .catch((error) => {
        this.logger.error({ err: error }, 'feedback_generation_trigger_error');
      })
      .finally(() => {
        this.pendingFeedbackGeneration = null;
      });
  }

  /**
   * Trigger memory generation
   * The callback handles turn counting and decides whether to create a memory
   */
  private triggerMemoryGeneration(): void {
    if (!this.memoryCallback) return;
    if (this.conversationId !== this.processingConversationId) {
      this.logger.info('skipping_memory_generation_conversation_changed');
      return;
    }

    const connection = this.connections[this.sessionId];
    if (!connection) return;

    // Capture conversationId now - don't rely on reading it later after async work
    const snapshotConversationId = this.processingConversationId;

    const recentMessages = connection.state.messages
      .slice(-RECENT_MESSAGES_FOR_MEMORY)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Track pending memory generation
    this.pendingMemoryGeneration = this.memoryCallback(
      recentMessages,
      snapshotConversationId
    )
      .catch((error) => {
        this.logger.error({ err: error }, 'memory_generation_trigger_error');
      })
      .finally(() => {
        this.pendingMemoryGeneration = null;
      });
  }

  // ============================================================
  // Public API (compatible with AudioProcessor)
  // ============================================================

  setFlashcardCallback(
    callback: (
      messages: Array<{ role: string; content: string }>,
      conversationId: string | null,
      languageCode: string
    ) => Promise<void>
  ): void {
    this.flashcardCallback = callback;
  }

  setFeedbackCallback(
    callback: (
      messages: Array<{ role: string; content: string }>,
      currentTranscript: string,
      conversationId: string | null,
      languageCode: string
    ) => Promise<void>
  ): void {
    this.feedbackCallback = callback;
  }

  setMemoryCallback(
    callback: (
      messages: Array<{ role: string; content: string }>,
      conversationId: string | null
    ) => Promise<void>
  ): void {
    this.memoryCallback = callback;
  }

  /**
   * Set the user ID for memory retrieval and creation
   * This should be called when user context is received
   */
  setUserId(userId: string): void {
    this.userId = userId;
    // Also update connection state so it flows through the graph
    const connection = this.connections[this.sessionId];
    if (connection) {
      connection.state.userId = userId;
    }
    this.logger.info({ userId: userId.substring(0, 8) }, 'user_id_set');
  }

  getConversationState(): {
    messages: Array<{ role: string; content: string; timestamp: string }>;
  } {
    const connection = this.connections[this.sessionId];
    return {
      messages:
        connection?.state.messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || new Date().toISOString(),
        })) || [],
    };
  }

  getLanguageCode(): string {
    return this.languageCode;
  }

  getLanguageConfig(): LanguageConfig {
    return this.languageConfig;
  }

  /**
   * Update language for this connection
   */
  setLanguage(languageCode: string): void {
    if (this.languageCode === languageCode) return;

    this.logger.info(
      { from: this.languageCode, to: languageCode },
      'changing_language'
    );

    this.languageCode = languageCode;
    this.languageConfig = getLanguageConfig(languageCode);

    const connection = this.connections[this.sessionId];
    if (connection) {
      connection.state.languageCode = languageCode;
      connection.state.targetLanguage = this.languageConfig.name;
      connection.state.voiceId = this.languageConfig.ttsConfig.speakerId;
    }
  }

  /**
   * Reset conversation state
   */
  reset(): void {
    const connection = this.connections[this.sessionId];
    if (connection) {
      connection.state.messages = [];
      connection.state.interactionId = '';
    }
    this.logger.info('conversation_reset');
  }

  /**
   * Load conversation history from client
   * Called when switching to an existing conversation
   */
  loadConversationHistory(
    messages: Array<{ role: string; content: string; timestamp?: string }>
  ): void {
    const connection = this.connections[this.sessionId];
    if (!connection) {
      this.logger.warn('connection_not_found_for_history_load');
      return;
    }

    // Convert client messages to backend format
    const chatMessages = messages.map((m, index) => ({
      id: `msg_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`,
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      timestamp: m.timestamp || new Date().toISOString(),
    }));

    connection.state.messages = chatMessages;

    this.logger.info(
      { messageCount: chatMessages.length },
      'conversation_history_loaded'
    );
  }

  /**
   * Wait for all pending operations to complete
   * Used before switching conversations
   */
  async waitForPendingOperations(): Promise<void> {
    // FIRST: Wait for graph processing to complete (isProcessingResponse becomes false)
    // This ensures flashcard/feedback generation has been triggered before we check for them
    if (this.isProcessingResponse) {
      this.logger.info('waiting_for_graph_processing_to_complete');
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isProcessingResponse) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });
      this.logger.info('graph_processing_completed');
    }

    // SECOND: After graph processing completes, check for pending flashcard/feedback/memory generation
    // By this point, triggerFlashcardGeneration(), triggerFeedbackGeneration(), and triggerMemoryGeneration() have been called
    const promises: Promise<void>[] = [];

    if (this.pendingFlashcardGeneration) {
      this.logger.info('waiting_for_flashcard_generation');
      promises.push(this.pendingFlashcardGeneration);
    }

    if (this.pendingFeedbackGeneration) {
      this.logger.info('waiting_for_feedback_generation');
      promises.push(this.pendingFeedbackGeneration);
    }

    if (this.pendingMemoryGeneration) {
      this.logger.info('waiting_for_memory_generation');
      promises.push(this.pendingMemoryGeneration);
    }

    if (promises.length > 0) {
      this.logger.info(
        { pendingCount: promises.length },
        'waiting_for_pending_operations'
      );
      await Promise.all(promises);
      this.logger.info('pending_operations_completed');
    }
  }

  /**
   * Switch to a new conversation
   * Waits for pending operations, then updates language, history, and conversationId
   */
  async switchConversation(
    conversationId: string,
    languageCode: string,
    messages: Array<{ role: string; content: string; timestamp?: string }>
  ): Promise<boolean> {
    if (this.isSwitchingConversation) {
      this.logger.warn('conversation_switch_already_in_progress');
      return false;
    }

    this.isSwitchingConversation = true;
    this.logger.info(
      { conversationId, languageCode, messageCount: messages.length },
      'switching_conversation'
    );

    try {
      // Wait for pending operations to complete
      await this.waitForPendingOperations();

      // Update language
      const newLanguageConfig = getLanguageConfig(languageCode);
      this.languageCode = languageCode;
      this.languageConfig = newLanguageConfig;

      // Update connection state
      const connection = this.connections[this.sessionId];
      if (connection) {
        connection.state.languageCode = languageCode;
        connection.state.targetLanguage = newLanguageConfig.name;
        connection.state.voiceId = newLanguageConfig.ttsConfig.speakerId;
        connection.state.conversationId = conversationId;

        // Load conversation history
        const chatMessages = messages.map((m, index) => ({
          id: `msg_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          timestamp: m.timestamp || new Date().toISOString(),
        }));

        connection.state.messages = chatMessages;
      }

      // Update conversationId
      this.conversationId = conversationId;

      this.logger.info(
        { conversationId, languageCode, messageCount: messages.length },
        'conversation_switched'
      );
      return true;
    } finally {
      this.isSwitchingConversation = false;
    }
  }

  /**
   * Get current conversation ID
   */
  getConversationId(): string | null {
    return this.conversationId;
  }

  /**
   * Send a text message (bypasses audio/STT, goes directly to LLM)
   */
  sendTextMessage(text: string): void {
    if (this.isDestroyed) return;

    const trimmedText = text.trim();
    if (!trimmedText) return;

    this.logger.debug(
      { textSnippet: trimmedText.substring(0, 50) },
      'sending_text_message'
    );
    this.multimodalStreamManager.pushText(trimmedText);
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    this.logger.info('destroying_session');
    this.isDestroyed = true;

    // End the multimodal stream
    this.multimodalStreamManager.end();

    // Remove from connections map
    delete this.connections[this.sessionId];

    this.logger.info('session_destroyed');
  }
}
