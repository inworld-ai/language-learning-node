import { DataStreamWithMetadata } from '@inworld/runtime';
import { CustomNode, GraphTypes, ProcessContext } from '@inworld/runtime/graph';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

import { Connection } from '../../types/index.js';
import { audioDataToPCM16 } from '../../helpers/audio-utils.js';
import { createLogger } from '../../utils/logger.js';
import { STTNode } from './stt-node.js';

const logger = createLogger('Soniox');

const SONIOX_WEBSOCKET_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';
const SONIOX_MODEL = 'stt-rt-v4';

/**
 * Configuration interface for SonioxSTTWebSocketNode
 */
export interface SonioxSTTWebSocketNodeConfig {
  /** Soniox API key */
  apiKey: string;
  /** Connections map to access session state */
  connections: { [sessionId: string]: Connection };
  /** Sample rate of the audio stream in Hz */
  sampleRate?: number;
  /** Maximum endpoint delay in milliseconds (500-3000, default 2000) */
  maxEndpointDelayMs?: number;
  /** Language hints for improved accuracy (e.g. ['en', 'es']) */
  languageHints?: string[];
}

/**
 * Manages a persistent WebSocket connection to Soniox for a single session.
 */
class SonioxSession {
  private ws: WebSocket | null = null;
  private wsReady: boolean = false;
  private wsConnectionPromise: Promise<void> | null = null;

  public shouldStopProcessing: boolean = false;

  private inactivityTimeout: NodeJS.Timeout | null = null;
  private keepaliveInterval: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private readonly INACTIVITY_TIMEOUT_MS = 60000;
  private readonly KEEPALIVE_INTERVAL_MS = 5000;

  constructor(
    public readonly sessionId: string,
    private apiKey: string,
    private sampleRate: number,
    private maxEndpointDelayMs: number,
    private languageHints: string[]
  ) {}

  public async ensureConnection(): Promise<void> {
    if (!this.ws || !this.wsReady || this.ws.readyState !== WebSocket.OPEN) {
      this.closeWebSocket();
      this.initializeWebSocket();
    }

    if (this.wsConnectionPromise) {
      await this.wsConnectionPromise;
    }

    this.shouldStopProcessing = false;
    this.resetInactivityTimer();
  }

  private initializeWebSocket(): void {
    logger.debug({ sessionId: this.sessionId }, 'initializing_websocket');

    this.wsConnectionPromise = new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(SONIOX_WEBSOCKET_URL);

      this.ws.on('open', () => {
        logger.debug({ sessionId: this.sessionId }, 'websocket_opened');

        const config = {
          api_key: this.apiKey,
          model: SONIOX_MODEL,
          audio_format: 'pcm_s16le',
          sample_rate: this.sampleRate,
          num_channels: 1,
          enable_endpoint_detection: true,
          max_endpoint_delay_ms: this.maxEndpointDelayMs,
          language_hints: this.languageHints,
          enable_language_identification: true,
        };

        this.ws!.send(JSON.stringify(config));
        logger.debug(
          {
            model: SONIOX_MODEL,
            sampleRate: this.sampleRate,
            maxEndpointDelayMs: this.maxEndpointDelayMs,
            languageHints: this.languageHints,
          },
          'config_sent'
        );

        this.wsReady = true;
        this.startKeepalive();
        resolve();
      });

      this.ws.on('error', (error: Error) => {
        logger.error({ err: error }, 'websocket_error');
        this.wsReady = false;
        reject(error);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.debug({ code, reason: reason.toString() }, 'websocket_closed');
        this.wsReady = false;
        this.stopKeepalive();
      });
    });
  }

  public onMessage(listener: (data: WebSocket.Data) => void): void {
    if (this.ws) {
      this.ws.on('message', listener);
    }
  }

  public offMessage(listener: (data: WebSocket.Data) => void): void {
    if (this.ws) {
      this.ws.off('message', listener);
    }
  }

  public sendAudio(pcm16Data: Int16Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(Buffer.from(pcm16Data.buffer));
      this.resetInactivityTimer();
    }
  }

  public sendFinalize(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'finalize' }));
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'keepalive' }));
      }
    }, this.KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
    }
    this.lastActivityTime = Date.now();
    this.inactivityTimeout = setTimeout(() => {
      this.closeDueToInactivity();
    }, this.INACTIVITY_TIMEOUT_MS);
  }

  public clearInactivityTimer(): void {
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
      this.inactivityTimeout = null;
    }
  }

  /**
   * Update language hints. If they differ from the current hints, closes the
   * existing WebSocket so the next ensureConnection() reopens with the new config.
   */
  public updateLanguageHints(hints: string[]): void {
    const sorted = [...hints].sort();
    const currentSorted = [...this.languageHints].sort();
    if (sorted.join(',') === currentSorted.join(',')) return;

    logger.info(
      { sessionId: this.sessionId, from: this.languageHints, to: hints },
      'language_hints_changed'
    );
    this.languageHints = hints;
    this.closeWebSocket();
  }

  private closeDueToInactivity(): void {
    const inactiveFor = Date.now() - this.lastActivityTime;
    logger.info(
      { sessionId: this.sessionId, inactiveMs: inactiveFor },
      'closing_due_to_inactivity'
    );
    this.closeWebSocket();
  }

  private closeWebSocket(): void {
    this.stopKeepalive();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN) {
          // Send empty string to signal end-of-audio
          this.ws.send('');
          this.ws.close();
        }
      } catch (e) {
        logger.warn({ err: e }, 'error_closing_socket');
      }
      this.ws = null;
      this.wsReady = false;
    }
  }

  public async close(): Promise<void> {
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Signal end-of-audio
        this.ws.send('');
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        // Ignore
      }
    }

    this.closeWebSocket();
  }
}

/**
 * SonioxSTTWebSocketNode processes continuous multimodal streams using Soniox's
 * streaming Speech-to-Text service via direct WebSocket connection.
 *
 * This node:
 * - Receives MultimodalContent stream (audio and/or text)
 * - For audio: extracts audio and feeds to Soniox streaming transcriber
 * - For text: bypasses STT and returns text directly
 * - Detects turn endings using Soniox's semantic endpoint detection
 * - Returns DataStreamWithMetadata with transcribed text when a turn completes
 */
export class SonioxSTTWebSocketNode extends CustomNode implements STTNode {
  private apiKey: string;
  private connections: { [sessionId: string]: Connection };
  private sampleRate: number;
  private maxEndpointDelayMs: number;
  private languageHints: string[];

  private sessions: Map<string, SonioxSession> = new Map();
  private readonly TURN_COMPLETION_TIMEOUT_MS = 2000;
  private readonly MAX_TRANSCRIPTION_DURATION_MS = 40000;

  constructor(props: { id?: string; config: SonioxSTTWebSocketNodeConfig }) {
    const { config, ...nodeProps } = props;

    if (!config.apiKey) {
      throw new Error('SonioxSTTWebSocketNode requires an API key.');
    }
    if (!config.connections) {
      throw new Error('SonioxSTTWebSocketNode requires a connections object.');
    }

    super({ id: nodeProps.id || 'soniox-stt-ws-node' });

    this.apiKey = config.apiKey;
    this.connections = config.connections;
    this.sampleRate = config.sampleRate || 16000;
    this.maxEndpointDelayMs = config.maxEndpointDelayMs ?? 2000;
    this.languageHints = config.languageHints ?? ['en'];

    logger.info(
      {
        maxEndpointDelayMs: this.maxEndpointDelayMs,
        languageHints: this.languageHints,
      },
      'stt_node_configured'
    );
  }

  async process(
    context: ProcessContext,
    input0: AsyncIterableIterator<GraphTypes.MultimodalContent>,
    input: DataStreamWithMetadata
  ): Promise<DataStreamWithMetadata> {
    const multimodalStream =
      input !== undefined &&
      input !== null &&
      input instanceof DataStreamWithMetadata
        ? (input.toStream() as unknown as AsyncIterableIterator<GraphTypes.MultimodalContent>)
        : input0;

    const sessionId = context.getDatastore().get('sessionId') as string;
    const connection = this.connections[sessionId];

    if (connection?.unloaded) {
      throw Error(`Session unloaded for sessionId: ${sessionId}`);
    }
    if (!connection) {
      throw Error(`Failed to read connection for sessionId: ${sessionId}`);
    }

    const metadata = input?.getMetadata?.() || {};
    let previousIteration = (metadata.iteration as number) || 0;

    if (
      !connection.state.interactionId ||
      connection.state.interactionId === ''
    ) {
      connection.state.interactionId = uuidv4();
    }

    const currentId = connection.state.interactionId;
    const delimiterIndex = currentId.indexOf('#');

    if (previousIteration === 0 && delimiterIndex !== -1) {
      const iterationStr = currentId.substring(delimiterIndex + 1);
      const parsedIteration = parseInt(iterationStr, 10);
      if (!isNaN(parsedIteration) && /^\d+$/.test(iterationStr)) {
        previousIteration = parsedIteration;
      }
    }

    const iteration = previousIteration + 1;
    const baseId =
      delimiterIndex !== -1
        ? currentId.substring(0, delimiterIndex)
        : currentId;
    const nextInteractionId = `${baseId}#${iteration}`;

    logger.debug({ iteration }, 'starting_transcription');

    // State tracking
    let transcriptText = '';
    let turnDetected = false;
    let speechDetected = false;
    let audioChunkCount = 0;
    let totalAudioSamples = 0;
    let isStreamExhausted = false;
    let errorOccurred = false;
    let errorMessage = '';
    let maxDurationReached = false;
    let isTextInput = false;
    let textContent: string | undefined;

    // Soniox token accumulation
    const finalTokenTexts: string[] = [];

    // Derive per-session language hints from the connection's active language
    const targetLang = connection.state.languageCode || 'es';
    const sessionLanguageHints =
      targetLang === 'en' ? ['en'] : ['en', targetLang];

    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new SonioxSession(
        sessionId,
        this.apiKey,
        this.sampleRate,
        this.maxEndpointDelayMs,
        sessionLanguageHints
      );
      this.sessions.set(sessionId, session);
    } else {
      session.updateLanguageHints(sessionLanguageHints);
    }

    // Promise to capture turn result
    let turnResolve: (value: string) => void = () => {};
    let turnReject: (error: Error) => void = () => {};
    let turnCompleted = false;
    const turnPromise = new Promise<string>((resolve, reject) => {
      turnResolve = resolve;
      turnReject = reject;
    });
    const turnPromiseWithState = turnPromise.then((value) => {
      turnCompleted = true;
      return value;
    });

    // Soniox message handler for this process() call
    const messageHandler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.error_code) {
          logger.error(
            { code: message.error_code, msg: message.error_message },
            'soniox_error'
          );
          errorOccurred = true;
          errorMessage = `${message.error_code}: ${message.error_message}`;
          return;
        }

        if (session?.shouldStopProcessing) {
          return;
        }

        const tokens = message.tokens;
        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
          return;
        }

        let endpointDetected = false;
        const nonFinalTexts: string[] = [];

        for (const token of tokens) {
          const text = token.text || '';

          if (token.is_final) {
            // <end> token signals endpoint detection
            if (text === '<end>') {
              endpointDetected = true;
            } else {
              finalTokenTexts.push(text);
            }
          } else {
            nonFinalTexts.push(text);
          }
        }

        // Trigger speech detected on first meaningful text
        if (
          !speechDetected &&
          (nonFinalTexts.length > 0 || finalTokenTexts.length > 0)
        ) {
          const hasText =
            nonFinalTexts.some((t) => t.trim().length > 0) ||
            finalTokenTexts.some((t) => t.trim().length > 0);
          if (hasText) {
            speechDetected = true;
            logger.debug({ iteration }, 'speech_detected');
            if (connection?.onSpeechDetected) {
              connection.onSpeechDetected(nextInteractionId);
            }
          }
        }

        // Send partial transcript from non-final tokens
        if (nonFinalTexts.length > 0) {
          const partialText = [...finalTokenTexts, ...nonFinalTexts]
            .join('')
            .trim();
          if (partialText) {
            this.sendPartialTranscript(
              sessionId,
              nextInteractionId,
              partialText
            );
          }
        }

        if (endpointDetected) {
          let finalTranscript = finalTokenTexts.join('').trim();

          // Check for pending transcript to stitch
          if (connection?.pendingTranscript) {
            finalTranscript =
              `${connection.pendingTranscript} ${finalTranscript}`.trim();
            logger.debug(
              {
                iteration,
                transcriptSnippet: finalTranscript.substring(0, 80),
              },
              'stitched_transcript'
            );
            connection.pendingTranscript = undefined;
          } else {
            logger.debug(
              {
                iteration,
                transcriptSnippet: finalTranscript.substring(0, 50),
              },
              'endpoint_detected'
            );
          }

          if (connection) {
            connection.isProcessingInterrupted = false;
          }

          transcriptText = finalTranscript;
          turnDetected = true;
          if (session) session.shouldStopProcessing = true;
          turnResolve(finalTranscript);
        }
      } catch (error) {
        logger.error({ err: error }, 'error_handling_message');
      }
    };

    try {
      await session.ensureConnection();
      session.onMessage(messageHandler);

      const audioProcessingPromise = (async () => {
        let maxDurationTimeout: NodeJS.Timeout | null = null;
        try {
          maxDurationTimeout = setTimeout(() => {
            maxDurationReached = true;
          }, this.MAX_TRANSCRIPTION_DURATION_MS);

          while (true) {
            if (session?.shouldStopProcessing) break;

            if (maxDurationReached && !transcriptText) {
              logger.warn(
                { maxDurationMs: this.MAX_TRANSCRIPTION_DURATION_MS },
                'max_transcription_duration_reached'
              );
              break;
            }

            const result = await multimodalStream.next();

            if (result.done) {
              logger.debug(
                { iteration, audioChunkCount },
                'multimodal_stream_exhausted'
              );
              isStreamExhausted = true;
              break;
            }

            if (session?.shouldStopProcessing) break;

            const content = result.value as GraphTypes.MultimodalContent;

            // Handle text input
            if (content.text !== undefined && content.text !== null) {
              logger.debug(
                { iteration, textSnippet: content.text.substring(0, 50) },
                'text_input_detected'
              );
              isTextInput = true;
              textContent = content.text;
              transcriptText = content.text;
              turnDetected = true;
              if (session) {
                session.shouldStopProcessing = true;
                session.clearInactivityTimer();
              }
              turnResolve(transcriptText);
              break;
            }

            // Extract audio
            if (content.audio === undefined || content.audio === null) continue;

            const audioData = content.audio.data;
            if (!audioData || audioData.length === 0) continue;

            audioChunkCount++;
            totalAudioSamples += audioData.length;

            const pcm16Data = audioDataToPCM16(audioData);
            session?.sendAudio(pcm16Data);
          }
        } catch (error) {
          logger.error({ err: error }, 'error_processing_audio');
          errorOccurred = true;
          errorMessage = error instanceof Error ? error.message : String(error);
          throw error;
        } finally {
          if (maxDurationTimeout) {
            clearTimeout(maxDurationTimeout);
          }
        }
      })();

      const raceResult = await Promise.race([
        turnPromiseWithState.then(() => ({ winner: 'turn' as const })),
        audioProcessingPromise.then(() => ({ winner: 'audio' as const })),
      ]);

      if (
        raceResult.winner === 'audio' &&
        !turnCompleted &&
        !maxDurationReached
      ) {
        logger.debug(
          { waitMs: this.TURN_COMPLETION_TIMEOUT_MS },
          'audio_ended_before_turn_waiting'
        );

        // Send finalize to force Soniox to return any remaining tokens
        session.sendFinalize();

        const timeoutPromise = new Promise<{ winner: 'timeout' }>((resolve) =>
          setTimeout(
            () => resolve({ winner: 'timeout' }),
            this.TURN_COMPLETION_TIMEOUT_MS
          )
        );

        const waitResult = await Promise.race([
          turnPromiseWithState.then(() => ({ winner: 'turn' as const })),
          timeoutPromise,
        ]);

        if (waitResult.winner === 'timeout' && !turnCompleted) {
          logger.warn('timed_out_waiting_for_turn');
          turnReject?.(new Error('Timed out waiting for turn completion'));
        }
      }

      await audioProcessingPromise.catch(() => {});

      logger.debug(
        { iteration, transcriptSnippet: transcriptText?.substring(0, 50) },
        'transcription_complete'
      );

      if (turnDetected) {
        connection.state.interactionId = '';
      }

      const taggedStream = Object.assign(multimodalStream, {
        type: 'MultimodalContent',
        abort: () => {},
        getMetadata: () => ({}),
      });

      return new DataStreamWithMetadata(taggedStream, {
        elementType: 'MultimodalContent',
        iteration: iteration,
        interactionId: nextInteractionId,
        session_id: sessionId,
        transcript: transcriptText,
        turn_detected: turnDetected,
        audio_chunk_count: audioChunkCount,
        total_audio_samples: totalAudioSamples,
        sample_rate: this.sampleRate,
        stream_exhausted: isStreamExhausted,
        interaction_complete: turnDetected && transcriptText.length > 0,
        error_occurred: errorOccurred,
        error_message: errorMessage,
        is_text_input: isTextInput,
        text_content: textContent,
      });
    } catch (error) {
      logger.error({ err: error, iteration }, 'transcription_failed');

      const taggedStream = Object.assign(multimodalStream, {
        type: 'MultimodalContent',
        abort: () => {},
        getMetadata: () => ({}),
      });

      return new DataStreamWithMetadata(taggedStream, {
        elementType: 'MultimodalContent',
        iteration: iteration,
        interactionId: nextInteractionId,
        session_id: sessionId,
        transcript: '',
        turn_detected: false,
        stream_exhausted: isStreamExhausted,
        interaction_complete: false,
        error_occurred: true,
        error_message: error instanceof Error ? error.message : String(error),
        is_text_input: isTextInput,
        text_content: textContent,
      });
    } finally {
      if (session) {
        session.offMessage(messageHandler);
      }
    }
  }

  private sendPartialTranscript(
    sessionId: string,
    interactionId: string,
    text: string
  ): void {
    const connection = this.connections[sessionId];
    if (!connection?.onPartialTranscript) return;

    try {
      connection.onPartialTranscript(text, interactionId);
    } catch (error) {
      logger.error({ err: error }, 'error_sending_partial_transcript');
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      logger.debug({ sessionId }, 'closing_session');
      await session.close();
      this.sessions.delete(sessionId);
    }
  }

  async destroy(): Promise<void> {
    logger.info({ sessionCount: this.sessions.size }, 'destroying_node');

    const promises: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      promises.push(session.close());
    }

    await Promise.all(promises);
    this.sessions.clear();
  }
}
