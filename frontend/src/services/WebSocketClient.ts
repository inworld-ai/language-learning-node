import type { Flashcard } from '../types';

type EventCallback = (data: unknown) => void;

export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, EventCallback[]>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isIOS: boolean;
  private isConnecting = false;
  private isIntentionalDisconnect = false;
  private connectionId = 0; // Track current connection to ignore stale handlers

  constructor(url: string) {
    this.url = url;

    // Check for iOS
    this.isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (this.isIOS && window.iosAudioHandler) {
      const optimizedUrl = window.iosAudioHandler.getOptimizedWebSocketURL?.();
      if (optimizedUrl) {
        console.log(
          '[WebSocketClient] Using iOS-optimized WebSocket URL:',
          optimizedUrl
        );
        this.url = optimizedUrl;
      }
    }
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  clearAllListeners(): void {
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private emit(event: string, data?: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  async connect(): Promise<void> {
    // Prevent duplicate connections
    if (this.isConnecting) {
      console.log('[WebSocketClient] Connection already in progress, skipping');
      return Promise.resolve();
    }
    if (this.isConnected()) {
      console.log('[WebSocketClient] Already connected, skipping');
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.isIntentionalDisconnect = false;

    // Increment connection ID - this allows us to ignore handlers from stale connections
    const thisConnectionId = ++this.connectionId;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          // Ignore if this is a stale connection
          if (thisConnectionId !== this.connectionId) {
            console.log(
              '[WebSocketClient] Ignoring onopen from stale connection'
            );
            return;
          }

          console.log('WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.emit('connection', 'connected');

          // Start ping/pong to keep connection alive
          this.startPingPong();

          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          // Ignore messages from stale connections
          if (thisConnectionId !== this.connectionId) {
            return;
          }

          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = (event: CloseEvent) => {
          // Ignore if this is a stale connection
          if (thisConnectionId !== this.connectionId) {
            console.log(
              '[WebSocketClient] Ignoring onclose from stale connection'
            );
            return;
          }

          console.log('WebSocket disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this.emit('connection', 'disconnected');

          this.stopPingPong();

          // Attempt reconnect on any unexpected close (skip only intentional disconnects)
          if (
            !this.isIntentionalDisconnect &&
            this.reconnectAttempts < this.maxReconnectAttempts
          ) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          // Ignore if this is a stale connection
          if (thisConnectionId !== this.connectionId) {
            console.log(
              '[WebSocketClient] Ignoring onerror from stale connection'
            );
            return;
          }

          console.error('WebSocket error:', error);
          this.isConnecting = false;
          this.emit('connection', 'disconnected');
          reject(error);
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.emit('connection', 'connecting');
      this.connect().catch(() => {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          this.emit('connection', 'disconnected');
        }
      });
    }, delay);
  }

  private handleMessage(message: {
    type: string;
    [key: string]: unknown;
  }): void {
    switch (message.type) {
      case 'transcription':
        this.emit('transcription', {
          text: message.text,
          conversationId: message.conversationId,
          timestamp: message.timestamp,
        });
        break;

      case 'ai_response':
        this.emit('ai_response', {
          text: (message.data as { text: string }).text,
          audio: (message.data as { audio?: string }).audio,
        });
        break;

      case 'flashcard_generated':
        this.emit('flashcard_generated', message.data);
        break;

      case 'flashcards_generated':
        this.emit('flashcards_generated', {
          flashcards: message.flashcards as Flashcard[],
          conversationId: message.conversationId,
        });
        break;

      case 'feedback_generated':
        this.emit('feedback_generated', {
          messageContent: message.messageContent,
          feedback: message.feedback,
          conversationId: message.conversationId,
        });
        break;

      case 'introduction_state_updated':
        this.emit('introduction_state_updated', message.introduction_state);
        break;

      case 'connection_status':
        // Connection status received
        break;

      case 'speech_detected':
        this.emit('speech_detected', message.data);
        break;

      case 'speech_ended':
        this.emit('speech_ended', message.data);
        break;

      case 'partial_transcript':
        this.emit('partial_transcript', {
          text: message.text,
          interactionId: message.interactionId,
          conversationId: message.conversationId,
          timestamp: message.timestamp,
        });
        break;

      case 'llm_response_chunk':
        this.emit('llm_response_chunk', {
          text: message.text,
          conversationId: message.conversationId,
          timestamp: message.timestamp,
        });
        break;

      case 'llm_response_complete':
        this.emit('llm_response_complete', {
          text: message.text,
          conversationId: message.conversationId,
          timestamp: message.timestamp,
        });
        break;

      case 'audio_stream':
        this.emit('audio_stream', {
          audio: message.audio,
          audioFormat: message.audioFormat || 'int16',
          sampleRate: message.sampleRate,
          conversationId: message.conversationId,
          timestamp: message.timestamp,
        });
        break;

      case 'audio_stream_complete':
        this.emit('audio_stream_complete', {
          conversationId: message.conversationId,
          timestamp: message.timestamp,
        });
        break;

      case 'interrupt':
        this.emit('interrupt', {
          reason: message.reason,
          conversationId: message.conversationId,
        });
        break;

      case 'conversation_rollback':
        this.emit('conversation_rollback', {
          messages: message.messages,
          removedCount: message.removedCount,
          conversationId: message.conversationId,
          timestamp: message.timestamp,
        });
        break;

      case 'language_changed':
        this.emit('language_changed', {
          languageCode: message.languageCode,
          languageName: message.languageName,
        });
        break;

      case 'tts_pronounce_audio':
        this.emit('tts_pronounce_audio', {
          audio: message.audio,
          audioFormat: message.audioFormat || 'float32',
          sampleRate: message.sampleRate,
        });
        break;

      case 'tts_pronounce_complete':
        this.emit('tts_pronounce_complete', {});
        break;

      case 'tts_pronounce_error':
        this.emit('tts_pronounce_error', {
          error: message.error,
        });
        break;

      case 'conversation_ready':
        this.emit('conversation_ready', {
          conversationId: message.conversationId,
          languageCode: message.languageCode,
        });
        break;

      case 'pong':
        // Expected keepalive response — no action needed
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  send(message: { type: string; [key: string]: unknown }): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendAudioChunk(audioData: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        type: 'audio_chunk',
        audio_data: audioData,
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    this.isIntentionalDisconnect = true;
    this.isConnecting = false;
    this.stopPingPong();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
        // Keepalive ping — silent
      }
    }, 30000);
  }

  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
