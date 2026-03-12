import { DataStreamWithMetadata } from '@inworld/runtime';
import { CustomNode, GraphTypes, ProcessContext } from '@inworld/runtime/graph';
import { v4 as uuidv4 } from 'uuid';

import { Connection } from '../../types/index.js';
import { audioDataToPCM16 } from '../../helpers/audio-utils.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('InworldSTT');

const INWORLD_STT_URL = 'https://api.inworld.ai/stt/v1/transcribe';

/**
 * Configuration interface for InworldSTTNode
 */
export interface InworldSTTNodeConfig {
  /** Inworld API key (Base64 credentials) */
  apiKey: string;
  /** Connections map to access session state */
  connections: { [sessionId: string]: Connection };
  /** Sample rate of the audio stream in Hz */
  sampleRate?: number;
  /**
   * Duration of silence (ms) after speech that signals end-of-turn.
   * Lower = more responsive; higher = more patient with pauses.
   */
  silenceThresholdMs?: number;
  /** Minimum speech duration (ms) before a turn is considered valid */
  minSpeechMs?: number;
  /**
   * RMS energy threshold below which audio is considered silence (0–1 scale).
   * Tune this based on ambient noise levels.
   */
  silenceEnergyThreshold?: number;
}

/**
 * Compute root-mean-square energy of a PCM16 frame.
 * Returns a value in [0, 1] (normalised by the max Int16 value).
 */
function computeRMS(pcm16: Int16Array): number {
  if (pcm16.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm16.length; i++) {
    const s = pcm16[i] / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / pcm16.length);
}

/**
 * Encode a list of PCM16 chunks as a base64 LINEAR16 string suitable for
 * the Inworld STT REST API.
 */
function encodePCM16ToBase64(chunks: Int16Array[]): string {
  const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
  const buffer = new Int16Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  // Convert Int16Array to Buffer (little-endian bytes)
  const byteBuffer = Buffer.from(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  return byteBuffer.toString('base64');
}

/** Timeout for STT API requests in milliseconds */
const STT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Call the Inworld STT REST API with buffered PCM16 audio.
 */
async function callInworldSTT(
  apiKey: string,
  audioBase64: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(INWORLD_STT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcribeConfig: {
          modelId: 'groq/whisper-large-v3',
          audioEncoding: 'LINEAR16',
        },
        audioData: {
          content: audioBase64,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `Inworld STT request failed: ${response.status} ${response.statusText} - ${errText}`
      );
    }

    const json = (await response.json()) as {
      transcription?: { transcript?: string };
    };
    return json?.transcription?.transcript ?? '';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Inworld STT request timed out after ${STT_REQUEST_TIMEOUT_MS}ms`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * InworldSTTNode processes continuous multimodal streams using Inworld's
 * Speech-to-Text REST API combined with energy-based VAD.
 *
 * This node:
 * - Receives MultimodalContent stream (audio and/or text)
 * - For audio: buffers PCM16 data, detects end-of-turn via silence energy,
 *   then POSTs to the Inworld STT API for transcription
 * - For text: bypasses STT and returns text directly
 * - Returns DataStreamWithMetadata with transcribed text when a turn completes
 */
export class InworldSTTNode extends CustomNode {
  private apiKey: string;
  private connections: { [sessionId: string]: Connection };
  private sampleRate: number;
  private silenceThresholdMs: number;
  private minSpeechMs: number;
  private silenceEnergyThreshold: number;

  private readonly MAX_TRANSCRIPTION_DURATION_MS = 40000;

  constructor(props: { id?: string; config: InworldSTTNodeConfig }) {
    const { config, ...nodeProps } = props;

    if (!config.apiKey) {
      throw new Error('InworldSTTNode requires an API key.');
    }
    if (!config.connections) {
      throw new Error('InworldSTTNode requires a connections object.');
    }

    super({ id: nodeProps.id || 'inworld-stt-node' });

    this.apiKey = config.apiKey;
    this.connections = config.connections;
    this.sampleRate = config.sampleRate ?? 16000;
    this.silenceThresholdMs = config.silenceThresholdMs ?? 800;
    this.minSpeechMs = config.minSpeechMs ?? 200;
    this.silenceEnergyThreshold = config.silenceEnergyThreshold ?? 0.01;

    logger.info(
      {
        silenceThresholdMs: this.silenceThresholdMs,
        minSpeechMs: this.minSpeechMs,
        energyThreshold: this.silenceEnergyThreshold,
      },
      'stt_node_configured'
    );
  }

  /**
   * Process multimodal stream, detect turn end via VAD, then transcribe via
   * Inworld STT REST API.
   */
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

    // Compute iteration counter
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
    let isTextInput = false;
    let textContent: string | undefined;

    // VAD state
    const speechBuffer: Int16Array[] = [];
    const silenceChunksThreshold = Math.ceil(
      this.silenceThresholdMs / 100 // chunks are ~100ms each (1600 samples @ 16kHz)
    );
    const minSpeechChunks = Math.ceil(this.minSpeechMs / 100);

    let silenceChunkCount = 0;
    let speechChunkCount = 0;
    let maxDurationReached = false;
    let turnEndedByVAD = false;

    // Safety timer
    const maxDurationTimer = setTimeout(() => {
      maxDurationReached = true;
    }, this.MAX_TRANSCRIPTION_DURATION_MS);

    try {
      for await (const content of multimodalStream) {
        // Handle text input — bypass STT entirely
        if (content.text !== undefined && content.text !== null) {
          logger.debug(
            { iteration, textSnippet: content.text.substring(0, 50) },
            'text_input_detected'
          );
          isTextInput = true;
          textContent = content.text;
          transcriptText = content.text;
          turnDetected = true;
          turnEndedByVAD = false;
          break;
        }

        // Safety: stop if max duration reached and we have some speech
        if (maxDurationReached) {
          if (speechChunkCount >= minSpeechChunks) {
            logger.warn(
              { maxDurationMs: this.MAX_TRANSCRIPTION_DURATION_MS },
              'max_transcription_duration_reached'
            );
            turnEndedByVAD = true;
          }
          break;
        }

        // Extract audio
        const audioData = content.audio?.data;
        if (!audioData || audioData.length === 0) continue;

        audioChunkCount++;
        totalAudioSamples += audioData.length;

        const pcm16 = audioDataToPCM16(audioData);
        const rms = computeRMS(pcm16);

        if (rms > this.silenceEnergyThreshold) {
          // Active speech
          silenceChunkCount = 0;
          speechChunkCount++;
          speechBuffer.push(pcm16);

          if (!speechDetected) {
            speechDetected = true;
            logger.debug({ iteration }, 'speech_detected');

            // Notify connection of speech start (triggers UI interrupt / speech indicator)
            if (connection.onSpeechDetected) {
              connection.onSpeechDetected(nextInteractionId);
            }
          }
        } else {
          // Silence
          if (speechDetected) {
            silenceChunkCount++;
            // Still buffer the silence (avoids cutting off trailing phonemes)
            speechBuffer.push(pcm16);

            if (silenceChunkCount >= silenceChunksThreshold) {
              // Enough silence after speech — treat as end of turn
              if (speechChunkCount >= minSpeechChunks) {
                logger.debug(
                  { iteration, speechChunkCount, silenceChunkCount },
                  'vad_end_of_turn'
                );
                turnEndedByVAD = true;
                break;
              } else {
                // Too short — discard and reset
                logger.debug({ iteration }, 'vad_noise_discarded');
                speechBuffer.length = 0;
                speechDetected = false;
                speechChunkCount = 0;
                silenceChunkCount = 0;
              }
            }
          }
        }
      }

      // Stream exhausted naturally (no more audio)
      if (!isTextInput && !turnEndedByVAD) {
        isStreamExhausted = true;
        if (speechDetected && speechChunkCount >= minSpeechChunks) {
          turnEndedByVAD = true;
        }
      }

      // Transcribe buffered speech via Inworld REST API
      if (turnEndedByVAD && speechBuffer.length > 0) {
        try {
          const audioBase64 = encodePCM16ToBase64(speechBuffer);

          logger.debug(
            {
              iteration,
              speechChunks: speechBuffer.length,
              totalSamples: speechBuffer.reduce((a, c) => a + c.length, 0),
            },
            'calling_inworld_stt'
          );

          let rawTranscript = await callInworldSTT(this.apiKey, audioBase64);

          // Stitch pending transcript if present
          if (connection.pendingTranscript) {
            rawTranscript =
              `${connection.pendingTranscript} ${rawTranscript}`.trim();
            logger.debug(
              { iteration, transcriptSnippet: rawTranscript.substring(0, 80) },
              'stitched_transcript'
            );
            connection.pendingTranscript = undefined;
          }

          transcriptText = rawTranscript;
          turnDetected = transcriptText.length > 0;

          if (turnDetected) {
            // Clear interrupt flag for new processing
            if (connection) {
              connection.isProcessingInterrupted = false;
            }
            logger.debug(
              { iteration, transcriptSnippet: transcriptText.substring(0, 50) },
              'turn_detected'
            );
          }
        } catch (err) {
          logger.error({ err, iteration }, 'inworld_stt_call_failed');
          errorOccurred = true;
          errorMessage = err instanceof Error ? err.message : String(err);
        }
      }

      if (turnDetected) {
        connection.state.interactionId = '';
      }

      logger.debug(
        { iteration, transcriptSnippet: transcriptText?.substring(0, 50) },
        'transcription_complete'
      );

      const taggedStream = Object.assign(multimodalStream, {
        type: 'MultimodalContent',
        abort: () => {},
        getMetadata: () => ({}),
      });

      return new DataStreamWithMetadata(taggedStream, {
        elementType: 'MultimodalContent',
        iteration,
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
        iteration,
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
      clearTimeout(maxDurationTimer);
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

  async destroy(): Promise<void> {
    logger.info('destroying_node');
  }
}
