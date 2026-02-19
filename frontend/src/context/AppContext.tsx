import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  AppState,
  ChatMessage,
  Flashcard,
  Language,
  ConnectionStatus,
  AudioStreamData,
  FeedbackGeneratedPayload,
  ConversationSummary,
} from '../types';
import { HybridStorage } from '../services/HybridStorage';
import { WebSocketClient } from '../services/WebSocketClient';
import { AudioHandler } from '../services/AudioHandler';
import { AudioPlayer } from '../services/AudioPlayer';
import { useAuth } from './AuthContext';

// Helper to determine WebSocket URL for Cloud Run deployment
const getWebSocketUrl = (): string => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    // Convert https:// to wss:// or http:// to ws://
    return backendUrl.replace(/^http/, 'ws');
  }
  // Same-origin: use current host (works in production when backend serves frontend)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev mode, backend runs on port 3000; in production, same port
  const host = import.meta.env.DEV
    ? `${window.location.hostname}:3000`
    : window.location.host;
  return `${protocol}//${host}`;
};

// Helper for API URL for Cloud Run deployment
const getApiUrl = (path: string): string => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  return backendUrl ? `${backendUrl}${path}` : path;
};

// Action types
type AppAction =
  | { type: 'SET_CONNECTION_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_UI_LANGUAGE'; payload: string }
  | { type: 'SET_AVAILABLE_LANGUAGES'; payload: Language[] }
  | { type: 'SET_CHAT_HISTORY'; payload: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_CURRENT_TRANSCRIPT'; payload: string }
  | { type: 'SET_PENDING_TRANSCRIPTION'; payload: string | null }
  | { type: 'SET_STREAMING_LLM_RESPONSE'; payload: string }
  | { type: 'APPEND_LLM_CHUNK'; payload: string }
  | { type: 'SET_LLM_COMPLETE'; payload: boolean }
  | { type: 'SET_RESPONSE_ID'; payload: string | null }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_SPEECH_DETECTED'; payload: boolean }
  | { type: 'SET_FLASHCARDS'; payload: Flashcard[] }
  | { type: 'ADD_FLASHCARDS'; payload: Flashcard[] }
  | { type: 'SET_PRONOUNCING_CARD_ID'; payload: string | null }
  | {
      type: 'SET_FEEDBACK';
      payload: { messageContent: string; feedback: string };
    }
  | { type: 'SET_FEEDBACK_MAP'; payload: Record<string, string> }
  | { type: 'RESET_STREAMING_STATE' }
  | { type: 'RESET_CONVERSATION' }
  | { type: 'SET_CONVERSATIONS'; payload: ConversationSummary[] }
  | { type: 'SET_CURRENT_CONVERSATION_ID'; payload: string | null }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'ADD_CONVERSATION'; payload: ConversationSummary }
  | { type: 'REMOVE_CONVERSATION'; payload: string }
  | { type: 'RENAME_CONVERSATION'; payload: { id: string; title: string } }
  | { type: 'SET_USER_ID'; payload: string | null }
  | { type: 'SET_SWITCHING_CONVERSATION'; payload: boolean };

// Initial state
const createInitialState = (storage: HybridStorage): AppState => {
  // Determine the language from the current conversation, not from stored preference
  let initialLanguage = storage.getLanguage(); // fallback to stored preference
  const currentConversationId = storage.getCurrentConversationId();
  if (currentConversationId) {
    const allConversations = storage.getAllConversations();
    const currentConversation = allConversations.find(
      (c) => c.id === currentConversationId
    );
    if (currentConversation) {
      initialLanguage = currentConversation.languageCode;
    }
  }

  return {
    connectionStatus: 'connecting',
    currentLanguage: initialLanguage,
    uiLanguage: storage.getUiLanguage() || 'es',
    availableLanguages: [],
    chatHistory: [],
    currentTranscript: '',
    pendingTranscription: null,
    streamingLLMResponse: '',
    llmResponseComplete: false,
    currentResponseId: null,
    isRecording: false,
    speechDetected: false,
    flashcards: [],
    pronouncingCardId: null,
    feedbackMap: {},
    userId: null,
    conversations: [],
    currentConversationId: null,
    sidebarOpen: false,
    switchingConversation: false,
  };
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    case 'SET_LANGUAGE':
      return { ...state, currentLanguage: action.payload };
    case 'SET_UI_LANGUAGE':
      return { ...state, uiLanguage: action.payload };
    case 'SET_AVAILABLE_LANGUAGES':
      return { ...state, availableLanguages: action.payload };
    case 'SET_CHAT_HISTORY':
      return { ...state, chatHistory: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, chatHistory: [...state.chatHistory, action.payload] };
    case 'SET_CURRENT_TRANSCRIPT':
      return { ...state, currentTranscript: action.payload };
    case 'SET_PENDING_TRANSCRIPTION':
      return { ...state, pendingTranscription: action.payload };
    case 'SET_STREAMING_LLM_RESPONSE':
      return { ...state, streamingLLMResponse: action.payload };
    case 'APPEND_LLM_CHUNK':
      return {
        ...state,
        streamingLLMResponse: state.streamingLLMResponse + action.payload,
      };
    case 'SET_LLM_COMPLETE':
      return { ...state, llmResponseComplete: action.payload };
    case 'SET_RESPONSE_ID':
      return { ...state, currentResponseId: action.payload };
    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload };
    case 'SET_SPEECH_DETECTED':
      return { ...state, speechDetected: action.payload };
    case 'SET_FLASHCARDS':
      return { ...state, flashcards: action.payload };
    case 'ADD_FLASHCARDS': {
      const existingWords = new Set(
        state.flashcards.map((f) =>
          (f.targetWord || f.spanish || '').toLowerCase()
        )
      );
      const newCards = action.payload.filter(
        (f) =>
          !existingWords.has((f.targetWord || f.spanish || '').toLowerCase())
      );
      return { ...state, flashcards: [...state.flashcards, ...newCards] };
    }
    case 'SET_PRONOUNCING_CARD_ID':
      return { ...state, pronouncingCardId: action.payload };
    case 'SET_FEEDBACK':
      return {
        ...state,
        feedbackMap: {
          ...state.feedbackMap,
          [action.payload.messageContent]: action.payload.feedback,
        },
        // Also update the message in chatHistory so it persists when saved
        chatHistory: state.chatHistory.map((m) =>
          m.content === action.payload.messageContent
            ? { ...m, feedback: action.payload.feedback }
            : m
        ),
      };
    case 'SET_FEEDBACK_MAP':
      return {
        ...state,
        feedbackMap: action.payload,
      };
    case 'RESET_STREAMING_STATE':
      return {
        ...state,
        streamingLLMResponse: '',
        llmResponseComplete: false,
        currentResponseId: null,
      };
    case 'RESET_CONVERSATION':
      return {
        ...state,
        chatHistory: [],
        currentTranscript: '',
        pendingTranscription: null,
        streamingLLMResponse: '',
        llmResponseComplete: false,
        currentResponseId: null,
        speechDetected: false,
      };
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.payload };
    case 'SET_CURRENT_CONVERSATION_ID':
      return { ...state, currentConversationId: action.payload };
    case 'SET_SIDEBAR_OPEN':
      return { ...state, sidebarOpen: action.payload };
    case 'ADD_CONVERSATION':
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      };
    case 'REMOVE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.filter(
          (c) => c.id !== action.payload
        ),
      };
    case 'RENAME_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.payload.id
            ? {
                ...c,
                title: action.payload.title,
                updatedAt: new Date().toISOString(),
              }
            : c
        ),
      };
    case 'SET_USER_ID':
      return { ...state, userId: action.payload };
    case 'SET_SWITCHING_CONVERSATION':
      return { ...state, switchingConversation: action.payload };
    default:
      return state;
  }
}

// Context type
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  storage: HybridStorage;
  wsClient: WebSocketClient;
  audioHandler: AudioHandler;
  audioPlayer: AudioPlayer;
  // Actions
  toggleRecording: () => Promise<void>;
  changeUiLanguage: (newLanguage: string) => void;
  handleInterrupt: () => void;
  sendTextMessage: (text: string) => void;
  pronounceWord: (text: string) => void;
  // Conversation actions
  selectConversation: (conversationId: string) => void;
  createNewConversation: () => void;
  deleteConversation: (conversationId: string) => void;
  renameConversation: (conversationId: string, newTitle: string) => void;
  toggleSidebar: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

// Provider
interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const { supabase, user } = useAuth();
  // Create instances directly using useMemo - these are stable and don't change
  const storageInstance = useMemo(() => new HybridStorage(), []);
  const storageRef = useRef(storageInstance);
  const wsClientInstance = useMemo(
    () => new WebSocketClient(getWebSocketUrl()),
    []
  );
  const wsClientRef = useRef(wsClientInstance);
  const audioHandlerInstance = useMemo(() => new AudioHandler(), []);
  const audioHandlerRef = useRef(audioHandlerInstance);
  const audioPlayerInstance = useMemo(() => new AudioPlayer(), []);
  const audioPlayerRef = useRef(audioPlayerInstance);
  const ttsAudioPlayerInstance = useMemo(() => new AudioPlayer(), []);
  const ttsAudioPlayerRef = useRef(ttsAudioPlayerInstance);
  const hasMigratedRef = useRef(false);
  const conversationsLoadedRef = useRef(false);

  const [state, dispatch] = useReducer(
    appReducer,
    storageInstance,
    createInitialState
  );

  // Refs for tracking state in callbacks
  const stateRef = useRef(state);

  // Update stateRef in effect to avoid updating ref during render
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Connect/disconnect Supabase based on auth state
  useEffect(() => {
    const storage = storageRef.current;

    if (supabase && user) {
      // Immediately update userId from auth
      dispatch({ type: 'SET_USER_ID', payload: user.id });

      storage.setSupabaseClient(supabase, user.id);

      // Sync data on login
      if (!hasMigratedRef.current) {
        hasMigratedRef.current = true;
        const languages = stateRef.current.availableLanguages.map(
          (l) => l.code
        );
        const langsToSync =
          languages.length > 0 ? languages : [stateRef.current.currentLanguage];

        // First try to sync ALL conversations FROM Supabase (existing user on new device)
        // Then migrate any local data TO Supabase
        storage
          .syncAllConversationsFromSupabase()
          .then((allConversations) => {
            // If user has conversations in Supabase, reload the UI state with ALL of them
            if (allConversations.length > 0) {
              dispatch({
                type: 'SET_CONVERSATIONS',
                payload: allConversations,
              });

              // Get the stored current conversation ID
              let currentId = storage.getCurrentConversationId();

              // If we have a stored conversation ID, verify it exists
              if (currentId) {
                const conversationExists = allConversations.find(
                  (c) => c.id === currentId
                );
                if (!conversationExists) {
                  // Stored conversation ID doesn't exist anymore, clear it
                  currentId = null;
                }
              }

              // If no stored conversation found, use the most recent one
              if (!currentId && allConversations.length > 0) {
                currentId = allConversations[0].id;
              }
            }
            // Also migrate any local data that isn't in Supabase yet
            return storage.migrateToSupabase(langsToSync);
          })
          .catch(console.error);
      }
    } else {
      // Clear userId on logout
      dispatch({ type: 'SET_USER_ID', payload: null });

      storage.clearSupabaseClient();
      hasMigratedRef.current = false;
      conversationsLoadedRef.current = false;
    }
  }, [supabase, user]);

  const pendingLLMResponseRef = useRef<string | null>(null);
  // Track if the last message was sent via text input (vs audio)
  // This allows us to ignore transcription events for text messages
  const lastMessageWasTextRef = useRef<boolean>(false);
  // Queue flashcards when conversation doesn't exist yet (race condition fix)
  const pendingFlashcardsRef = useRef<Flashcard[]>([]);

  // Refs for callbacks to avoid effect dependency issues
  const handleInterruptRef = useRef<() => void>(() => {});
  const checkAndUpdateConversationRef = useRef<() => void>(() => {});
  const processPendingFlashcardsRef = useRef<(conversationId: string) => void>(
    () => {}
  );
  const selectConversationRef = useRef<(conversationId: string) => void>(
    () => {}
  );

  // Initialize audio players
  useEffect(() => {
    const audioPlayer = audioPlayerRef.current;
    const ttsAudioPlayer = ttsAudioPlayerRef.current;
    audioPlayer.initialize().catch(console.error);
    ttsAudioPlayer.initialize().catch(console.error);
    return () => {
      audioPlayer.destroy();
      ttsAudioPlayer.destroy();
    };
  }, []);

  // Load initial state (conversations across all languages)
  // Only run if Supabase sync hasn't already loaded conversations
  useEffect(() => {
    if (conversationsLoadedRef.current) {
      return; // Supabase sync already loaded conversations
    }

    const storage = storageRef.current;

    // Load ALL conversations across all languages
    const allConversations = storage.getAllConversations();
    dispatch({ type: 'SET_CONVERSATIONS', payload: allConversations });

    // If no conversations, clear flashcards
    if (allConversations.length === 0) {
      dispatch({ type: 'SET_FLASHCARDS', payload: [] });
      conversationsLoadedRef.current = true;
    }
  }, []); // Run once on mount

  // Save chat history to current conversation when it changes
  useEffect(() => {
    const storage = storageRef.current;
    const currentId = stateRef.current.currentConversationId;
    const currentLang = stateRef.current.currentLanguage;

    if (currentId && state.chatHistory.length > 0) {
      const messages = state.chatHistory.map((m) => ({
        role: m.role === 'learner' ? 'user' : 'assistant',
        content: m.content,
        timestamp: m.timestamp || new Date().toISOString(),
        feedback: m.feedback,
      })) as import('../types').ConversationMessage[];
      storage.saveConversation(currentId, messages, currentLang);
    }
  }, [state.chatHistory]);

  // Fetch available languages
  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await fetch(getApiUrl('/api/languages'));
        if (response.ok) {
          const data = await response.json();
          dispatch({
            type: 'SET_AVAILABLE_LANGUAGES',
            payload: data.languages,
          });

          // Don't reset language if we have a current conversation - let selectConversation handle it
          // Only validate if we don't have a conversation loaded yet
          const currentLang = stateRef.current.currentLanguage;
          const hasCurrentConversation =
            !!stateRef.current.currentConversationId;
          const isValidLanguage = data.languages.some(
            (lang: Language) => lang.code === currentLang
          );
          // Only reset language if it's invalid AND we don't have a current conversation
          // (if we have a conversation, selectConversation will set the correct language)
          if (!isValidLanguage && !hasCurrentConversation) {
            dispatch({
              type: 'SET_LANGUAGE',
              payload: data.defaultLanguage || 'es',
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch languages:', error);
        dispatch({
          type: 'SET_AVAILABLE_LANGUAGES',
          payload: [
            { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇲🇽' },
          ],
        });
      }
    };
    fetchLanguages();
  }, []);

  // Check and update conversation
  const checkAndUpdateConversation = useCallback(() => {
    const currentState = stateRef.current;
    const pendingTranscription = currentState.pendingTranscription;
    const pendingLLMResponse = pendingLLMResponseRef.current;

    const storage = storageRef.current;
    const wsClient = wsClientRef.current;

    // Track conversation info (may be newly created or from state)
    let conversationId = currentState.currentConversationId;
    let conversationTitle: string | null = null;

    // Auto-create conversation if none exists and we're about to add messages
    if (!conversationId && (pendingTranscription || pendingLLMResponse)) {
      const newConversation = storage.createConversation(
        currentState.currentLanguage
      );
      conversationId = newConversation.id;
      conversationTitle = newConversation.title;
      dispatch({ type: 'ADD_CONVERSATION', payload: newConversation });
      dispatch({
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: newConversation.id,
      });
      storage.setCurrentConversationId(newConversation.id);
      // Process any flashcards that arrived before conversation was created
      processPendingFlashcardsRef.current(newConversation.id);
    } else if (conversationId) {
      // Get title from existing conversation in state
      const currentConvo = currentState.conversations.find(
        (c) => c.id === conversationId
      );
      conversationTitle = currentConvo?.title || null;
    }

    // Case 1: We have a pending LLM response but user message was already added (text input case)
    if (pendingLLMResponse && !pendingTranscription) {
      // Add only the teacher response
      storage.addMessage('assistant', pendingLLMResponse);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          role: 'teacher',
          content: pendingLLMResponse,
          timestamp: new Date().toISOString(),
        },
      });

      const conversationHistory = storage.getConversationHistory();
      wsClient.send({ type: 'conversation_update', data: conversationHistory });

      pendingLLMResponseRef.current = null;
      dispatch({ type: 'RESET_STREAMING_STATE' });
      return;
    }

    // Case 2: We have both pending transcription and LLM response (audio input case)
    if (pendingTranscription && pendingLLMResponse) {
      // Auto-rename conversation on first user message (if still has default name)
      if (
        conversationId &&
        conversationTitle &&
        /^Chat \d{5}$/.test(conversationTitle)
      ) {
        const newTitle =
          pendingTranscription.length > 10
            ? pendingTranscription.slice(0, 10) + '...'
            : pendingTranscription;
        storage.renameConversation(
          conversationId,
          newTitle,
          currentState.currentLanguage
        );
        dispatch({
          type: 'RENAME_CONVERSATION',
          payload: { id: conversationId, title: newTitle },
        });
      }

      storage.addMessage('user', pendingTranscription);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          role: 'learner',
          content: pendingTranscription,
          timestamp: new Date().toISOString(),
        },
      });

      storage.addMessage('assistant', pendingLLMResponse);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          role: 'teacher',
          content: pendingLLMResponse,
          timestamp: new Date().toISOString(),
        },
      });

      const conversationHistory = storage.getConversationHistory();
      wsClient.send({ type: 'conversation_update', data: conversationHistory });

      dispatch({ type: 'SET_PENDING_TRANSCRIPTION', payload: null });
      pendingLLMResponseRef.current = null;
      dispatch({ type: 'RESET_STREAMING_STATE' });
    }
  }, []);

  // Update refs in effect to avoid updating during render
  useEffect(() => {
    checkAndUpdateConversationRef.current = checkAndUpdateConversation;
  }, [checkAndUpdateConversation]);

  // Process any pending flashcards that were queued before conversation existed
  const processPendingFlashcards = useCallback((conversationId: string) => {
    const storage = storageRef.current;
    const pending = pendingFlashcardsRef.current;

    if (pending.length > 0) {
      console.log(
        `[AppContext] Processing ${pending.length} pending flashcards for conversation ${conversationId}`
      );
      const updatedFlashcards = storage.addFlashcardsForConversation(
        conversationId,
        pending,
        stateRef.current.currentLanguage
      );
      dispatch({ type: 'SET_FLASHCARDS', payload: updatedFlashcards });
      pendingFlashcardsRef.current = [];
    }
  }, []);

  // Update refs in effect to avoid updating during render
  useEffect(() => {
    processPendingFlashcardsRef.current = processPendingFlashcards;
  }, [processPendingFlashcards]);

  // Process pending flashcards when conversation ID becomes available
  // This handles the race condition where flashcards arrive before the conversation is created
  useEffect(() => {
    if (
      state.currentConversationId &&
      pendingFlashcardsRef.current.length > 0
    ) {
      processPendingFlashcards(state.currentConversationId);
    }
  }, [state.currentConversationId, processPendingFlashcards]);

  // Handle interrupt
  const handleInterrupt = useCallback(() => {
    console.log('[AppContext] Handling interrupt');
    const audioPlayer = audioPlayerRef.current;
    audioPlayer.stop();

    const currentState = stateRef.current;
    if (currentState.streamingLLMResponse?.trim()) {
      const frozenText = currentState.streamingLLMResponse;
      pendingLLMResponseRef.current = frozenText;

      if (currentState.pendingTranscription) {
        checkAndUpdateConversationRef.current();
      } else {
        const lastTeacherMessage = currentState.chatHistory
          .filter((m) => m.role === 'teacher')
          .pop();

        if (lastTeacherMessage?.content !== frozenText) {
          dispatch({
            type: 'ADD_MESSAGE',
            payload: {
              role: 'teacher',
              content: frozenText,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      dispatch({ type: 'RESET_STREAMING_STATE' });
    }
  }, []);

  // Update refs in effect to avoid updating during render
  useEffect(() => {
    handleInterruptRef.current = handleInterrupt;
  }, [handleInterrupt]);

  // Setup WebSocket event listeners - runs once on mount
  useEffect(() => {
    const wsClient = wsClientRef.current;
    const storage = storageRef.current;
    const audioPlayer = audioPlayerRef.current;

    // Clear any existing listeners to prevent duplicates
    wsClient.clearAllListeners();

    wsClient.on('connection', (status) => {
      dispatch({
        type: 'SET_CONNECTION_STATUS',
        payload: status as ConnectionStatus,
      });

      if (status === 'connected') {
        const existingConversation = storage.getConversationHistory();
        if (existingConversation.messages.length > 0) {
          wsClient.send({
            type: 'conversation_update',
            data: existingConversation,
          });
        }
      }
    });

    wsClient.on('speech_detected', (data) => {
      const payload = data as { text?: string; conversationId?: string };

      // Only process if it's for the current conversation
      if (
        !payload.conversationId ||
        payload.conversationId === stateRef.current.currentConversationId
      ) {
        dispatch({
          type: 'SET_CURRENT_TRANSCRIPT',
          payload: payload.text || '',
        });
        dispatch({ type: 'SET_SPEECH_DETECTED', payload: true });
        handleInterruptRef.current();
      }
    });

    wsClient.on('partial_transcript', (data) => {
      const payload = data as { text?: string; conversationId?: string };
      const text = payload.text;

      // Only process if it's for the current conversation
      if (
        text &&
        (!payload.conversationId ||
          payload.conversationId === stateRef.current.currentConversationId)
      ) {
        dispatch({ type: 'SET_CURRENT_TRANSCRIPT', payload: text });
        dispatch({ type: 'SET_SPEECH_DETECTED', payload: true });
      }
    });

    wsClient.on('speech_ended', () => {
      if (!stateRef.current.pendingTranscription) {
        dispatch({ type: 'SET_CURRENT_TRANSCRIPT', payload: '' });
        dispatch({ type: 'SET_SPEECH_DETECTED', payload: false });
      }
    });

    wsClient.on('transcription', (data) => {
      const payload = data as { text: string; conversationId?: string };
      const text = payload.text;

      // Only process if it's for the current conversation
      if (
        !payload.conversationId ||
        payload.conversationId === stateRef.current.currentConversationId
      ) {
        audioPlayer.stop();

        dispatch({ type: 'SET_CURRENT_TRANSCRIPT', payload: '' });
        dispatch({ type: 'SET_SPEECH_DETECTED', payload: false });

        // If the last message was sent via text input, ignore this transcription event
        // because the user message was already added in sendTextMessage
        if (lastMessageWasTextRef.current) {
          lastMessageWasTextRef.current = false;
          // Still need to check for LLM response and update conversation
          if (
            pendingLLMResponseRef.current &&
            !stateRef.current.streamingLLMResponse
          ) {
            checkAndUpdateConversationRef.current();
          }

          if (
            stateRef.current.streamingLLMResponse?.trim() &&
            stateRef.current.llmResponseComplete &&
            !pendingLLMResponseRef.current
          ) {
            pendingLLMResponseRef.current =
              stateRef.current.streamingLLMResponse;
            checkAndUpdateConversationRef.current();
          }

          dispatch({ type: 'RESET_STREAMING_STATE' });
          checkAndUpdateConversationRef.current();
          return;
        }

        // This is an audio-based transcription - set pending transcription
        dispatch({ type: 'SET_PENDING_TRANSCRIPTION', payload: text });

        if (
          pendingLLMResponseRef.current &&
          !stateRef.current.streamingLLMResponse
        ) {
          checkAndUpdateConversationRef.current();
        }

        if (
          stateRef.current.streamingLLMResponse?.trim() &&
          stateRef.current.llmResponseComplete &&
          !pendingLLMResponseRef.current
        ) {
          pendingLLMResponseRef.current = stateRef.current.streamingLLMResponse;
          checkAndUpdateConversationRef.current();
        }

        dispatch({ type: 'RESET_STREAMING_STATE' });
        checkAndUpdateConversationRef.current();
      }
    });

    wsClient.on('llm_response_chunk', (data) => {
      const payload = data as { text: string; conversationId?: string };

      // Only process if it's for the current conversation
      if (
        !payload.conversationId ||
        payload.conversationId === stateRef.current.currentConversationId
      ) {
        if (!stateRef.current.llmResponseComplete) {
          dispatch({
            type: 'APPEND_LLM_CHUNK',
            payload: payload.text,
          });
        }
      }
    });

    wsClient.on('llm_response_complete', (data) => {
      const payload = data as { text?: string; conversationId?: string };

      // Only process if it's for the current conversation
      if (
        !payload.conversationId ||
        payload.conversationId === stateRef.current.currentConversationId
      ) {
        const responseId = `response_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        dispatch({ type: 'SET_RESPONSE_ID', payload: responseId });
        dispatch({ type: 'SET_LLM_COMPLETE', payload: true });

        const finalText = payload.text || stateRef.current.streamingLLMResponse;
        dispatch({ type: 'SET_STREAMING_LLM_RESPONSE', payload: finalText });

        // Store the LLM response and trigger conversation update
        pendingLLMResponseRef.current = finalText;
        checkAndUpdateConversationRef.current();
      }
    });

    wsClient.on('audio_stream', (data) => {
      const audioData = data as AudioStreamData & { conversationId?: string };

      // Block all audio during conversation switch
      if (stateRef.current.switchingConversation) {
        return;
      }

      // Only process if it's for the current conversation
      if (
        !audioData.conversationId ||
        audioData.conversationId === stateRef.current.currentConversationId
      ) {
        audioPlayer.addAudioStream(
          audioData.audio,
          audioData.sampleRate,
          false,
          audioData.audioFormat
        );
      }
    });

    wsClient.on('audio_stream_complete', (data) => {
      // Block all audio during conversation switch
      if (stateRef.current.switchingConversation) {
        return;
      }

      const payload = data as { conversationId?: string };

      // Only process if it's for the current conversation
      if (
        !payload.conversationId ||
        payload.conversationId === stateRef.current.currentConversationId
      ) {
        audioPlayer.markStreamComplete();
      }
    });

    // TTS pronunciation handlers (for flashcard pronunciation)
    const ttsAudioPlayer = ttsAudioPlayerRef.current;
    wsClient.on('tts_pronounce_audio', (data) => {
      // Block all audio during conversation switch
      if (stateRef.current.switchingConversation) {
        return;
      }

      const audioData = data as {
        audio: string;
        audioFormat: string;
        sampleRate: number;
      };
      ttsAudioPlayer.addAudioStream(
        audioData.audio,
        audioData.sampleRate,
        false,
        audioData.audioFormat as 'int16' | 'float32'
      );
    });

    wsClient.on('tts_pronounce_complete', () => {
      // Block all audio during conversation switch
      if (stateRef.current.switchingConversation) {
        return;
      }
      dispatch({ type: 'SET_PRONOUNCING_CARD_ID', payload: null });
    });

    wsClient.on('tts_pronounce_error', () => {
      // Block all audio during conversation switch
      if (stateRef.current.switchingConversation) {
        return;
      }
      dispatch({ type: 'SET_PRONOUNCING_CARD_ID', payload: null });
    });

    wsClient.on('interrupt', (data) => {
      const payload = data as { reason?: string; conversationId?: string };
      const reason = payload.reason;

      // Only process if it's for the current conversation
      if (
        !payload.conversationId ||
        payload.conversationId === stateRef.current.currentConversationId
      ) {
        if (reason === 'continuation_detected') {
          // User is continuing their utterance - discard partial response silently
          console.log(
            '[AppContext] Continuation detected - discarding partial response'
          );
          audioPlayer.stop();
          // Don't save the partial response - just reset streaming state
          dispatch({ type: 'RESET_STREAMING_STATE' });
          pendingLLMResponseRef.current = null;
        } else {
          // Normal interrupt (speech_start) - use regular interrupt handling
          handleInterruptRef.current();
        }
      }
    });

    wsClient.on('conversation_rollback', (data) => {
      // Server removed messages due to utterance continuation - sync frontend state
      const payload = data as {
        messages: Array<{ role: string; content: string; timestamp?: string }>;
        removedCount: number;
        conversationId?: string;
      };
      const { messages, removedCount, conversationId } = payload;

      // Only process if it's for the current conversation
      if (
        !conversationId ||
        conversationId === stateRef.current.currentConversationId
      ) {
        console.log(
          `[AppContext] Conversation rollback - removed ${removedCount} messages`
        );

        // Convert backend format to frontend format
        const chatHistory = messages.map((m) => ({
          role: m.role === 'user' ? 'learner' : 'teacher',
          content: m.content,
          timestamp: m.timestamp,
        })) as ChatMessage[];

        // Update chat history to match server state
        dispatch({ type: 'SET_CHAT_HISTORY', payload: chatHistory });

        // Also update storage to stay in sync
        storage.clearConversation();
        messages.forEach((m) => {
          storage.addMessage(
            m.role === 'user' ? 'user' : 'assistant',
            m.content
          );
        });

        // Clear any pending state
        dispatch({ type: 'SET_PENDING_TRANSCRIPTION', payload: null });
        pendingLLMResponseRef.current = null;
      }
    });

    wsClient.on('flashcards_generated', (data) => {
      const payload = data as {
        flashcards: Flashcard[];
        conversationId?: string;
      };
      const cards = payload.flashcards || (data as Flashcard[]);
      const conversationId = payload.conversationId;

      // Use conversationId from payload if provided, otherwise use current
      const targetConversationId =
        conversationId || stateRef.current.currentConversationId;

      if (targetConversationId) {
        // Look up the conversation's language rather than using currentLanguage,
        // which may have already changed if the user switched conversations
        const conversation = stateRef.current.conversations.find(
          (c) => c.id === targetConversationId
        );
        const languageCode =
          conversation?.languageCode || stateRef.current.currentLanguage;

        const updatedFlashcards = storage.addFlashcardsForConversation(
          targetConversationId,
          Array.isArray(cards) ? cards : [],
          languageCode
        );

        // Only update UI if this is for the current conversation
        if (targetConversationId === stateRef.current.currentConversationId) {
          dispatch({ type: 'SET_FLASHCARDS', payload: updatedFlashcards });
        }
      } else {
        // No conversation yet - queue flashcards for later processing
        console.log(
          `[AppContext] Queuing ${Array.isArray(cards) ? cards.length : 0} flashcards (no conversation yet)`
        );
        pendingFlashcardsRef.current = [
          ...pendingFlashcardsRef.current,
          ...(Array.isArray(cards) ? cards : []),
        ];
      }
    });

    wsClient.on('feedback_generated', (data) => {
      const payload = data as FeedbackGeneratedPayload & {
        conversationId?: string;
      };
      const { messageContent, feedback, conversationId } = payload;

      // Use conversationId from payload if provided, otherwise use current
      const targetConversationId =
        conversationId || stateRef.current.currentConversationId;

      // Persist feedback to storage if we have a conversation ID
      if (targetConversationId) {
        storage.saveFeedback(targetConversationId, messageContent, feedback);
      }

      // Only update UI if it's for the current conversation
      if (
        !conversationId ||
        conversationId === stateRef.current.currentConversationId
      ) {
        dispatch({
          type: 'SET_FEEDBACK',
          payload: { messageContent, feedback },
        });
      }
    });

    wsClient.on('conversation_ready', (data) => {
      const { conversationId, languageCode } = data as {
        conversationId: string;
        languageCode: string;
      };

      // Ensure all audio is stopped
      const audioHandler = audioHandlerRef.current;
      const audioPlayer = audioPlayerRef.current;
      const ttsAudioPlayer = ttsAudioPlayerRef.current;
      audioHandler.stopStreaming();
      audioPlayer.stop();
      ttsAudioPlayer.stop();

      const storage = storageRef.current;

      // Update language if needed
      if (languageCode && languageCode !== stateRef.current.currentLanguage) {
        dispatch({ type: 'SET_LANGUAGE', payload: languageCode });
        storage.saveLanguage(languageCode);
      }

      // Load the conversation data
      const conversationData = storage.getConversation(conversationId);
      if (conversationData) {
        const chatHistory = conversationData.messages.map((m) => ({
          role: m.role === 'user' ? 'learner' : 'teacher',
          content: m.content,
          timestamp: m.timestamp,
          feedback: m.feedback,
        })) as ChatMessage[];
        dispatch({ type: 'SET_CHAT_HISTORY', payload: chatHistory });

        // Populate feedbackMap from message feedback fields
        const feedbackMap: Record<string, string> = {};
        for (const m of conversationData.messages) {
          if (m.feedback) {
            feedbackMap[m.content] = m.feedback;
          }
        }
        dispatch({ type: 'SET_FEEDBACK_MAP', payload: feedbackMap });
      } else {
        dispatch({ type: 'SET_CHAT_HISTORY', payload: [] });
        dispatch({ type: 'SET_FEEDBACK_MAP', payload: {} });
      }

      dispatch({
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: conversationId,
      });
      storage.setCurrentConversationId(conversationId);

      // Load flashcards for this specific conversation
      const flashcards = storage.getFlashcardsForConversation(conversationId);
      dispatch({ type: 'SET_FLASHCARDS', payload: flashcards });

      // Reset streaming state
      dispatch({ type: 'RESET_STREAMING_STATE' });
      pendingLLMResponseRef.current = null;
      lastMessageWasTextRef.current = false;
      pendingFlashcardsRef.current = [];

      // Hide loading screen
      dispatch({ type: 'SET_SWITCHING_CONVERSATION', payload: false });

      console.log(
        `Conversation ${conversationId} ready with language ${languageCode}`
      );
    });

    // Connect
    wsClient.connect().catch((error) => {
      console.error('WebSocket connection failed:', error);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'disconnected' });
    });

    // Cleanup - only runs on unmount
    return () => {
      wsClient.clearAllListeners();
      wsClient.disconnect();
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Audio chunk handler
  useEffect(() => {
    const audioHandler = audioHandlerRef.current;
    const wsClient = wsClientRef.current;

    const handleAudioChunk = (audioData: string) => {
      wsClient.sendAudioChunk(audioData);
    };

    audioHandler.on('audioChunk', handleAudioChunk);

    return () => {
      audioHandler.off('audioChunk', handleAudioChunk);
    };
  }, []);

  // User context on connect
  useEffect(() => {
    const wsClient = wsClientRef.current;

    if (state.connectionStatus === 'connected') {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        wsClient.send({
          type: 'user_context',
          timezone: tz,
          // Use auth user ID - will be null if not authenticated
          userId: user?.id || null,
          // Send current language so backend initializes with correct language
          languageCode: state.currentLanguage,
        });
      } catch {
        // ignore
      }
    }
  }, [state.connectionStatus, user, state.currentLanguage]);

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    const audioHandler = audioHandlerRef.current;

    if (!state.isRecording) {
      try {
        await audioHandler.startStreaming();
        dispatch({ type: 'SET_RECORDING', payload: true });
        dispatch({ type: 'SET_CURRENT_TRANSCRIPT', payload: '' });
        dispatch({ type: 'SET_SPEECH_DETECTED', payload: false });
      } catch (error) {
        console.error('Failed to start streaming:', error);
        alert(
          'Microphone access denied. Please enable microphone permissions.'
        );
      }
    } else {
      audioHandler.stopStreaming();
      dispatch({ type: 'SET_RECORDING', payload: false });
      dispatch({ type: 'SET_CURRENT_TRANSCRIPT', payload: '' });
      dispatch({ type: 'SET_SPEECH_DETECTED', payload: false });
    }
  }, [state.isRecording]);

  // Change UI language preference (for the button and new conversations)
  const changeUiLanguage = useCallback((newLanguage: string) => {
    const storage = storageRef.current;

    // Only update UI language (for the button and new conversations)
    // currentLanguage should only change when switching/creating conversations
    dispatch({ type: 'SET_UI_LANGUAGE', payload: newLanguage });
    storage.saveUiLanguage(newLanguage);
  }, []);

  // Send text message (bypasses audio/STT)
  const sendTextMessage = useCallback(
    (text: string) => {
      const wsClient = wsClientRef.current;
      const storage = storageRef.current;
      const trimmedText = text.trim();

      if (!trimmedText || state.connectionStatus !== 'connected') return;

      let conversationId = stateRef.current.currentConversationId;
      let conversationTitle: string | null = null;

      // Auto-create conversation if none exists
      if (!conversationId) {
        const newConversation = storage.createConversation(
          stateRef.current.currentLanguage
        );
        conversationId = newConversation.id;
        conversationTitle = newConversation.title;
        dispatch({ type: 'ADD_CONVERSATION', payload: newConversation });
        dispatch({
          type: 'SET_CURRENT_CONVERSATION_ID',
          payload: newConversation.id,
        });
        storage.setCurrentConversationId(newConversation.id);
        // Process any flashcards that arrived before conversation was created
        processPendingFlashcardsRef.current(newConversation.id);
      } else {
        // Get title from existing conversation in state
        const currentConvo = stateRef.current.conversations.find(
          (c) => c.id === conversationId
        );
        conversationTitle = currentConvo?.title || null;
      }

      // Auto-rename conversation on first user message (if still has default name)
      if (
        conversationId &&
        conversationTitle &&
        /^Chat \d{5}$/.test(conversationTitle)
      ) {
        const newTitle =
          trimmedText.length > 10
            ? trimmedText.slice(0, 10) + '...'
            : trimmedText;
        storage.renameConversation(
          conversationId,
          newTitle,
          stateRef.current.currentLanguage
        );
        dispatch({
          type: 'RENAME_CONVERSATION',
          payload: { id: conversationId, title: newTitle },
        });
      }

      // Add user message to chat history immediately (unlike audio where we wait for transcription)
      storage.addMessage('user', trimmedText);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          role: 'learner',
          content: trimmedText,
          timestamp: new Date().toISOString(),
        },
      });

      // Flag that this was a text message so we can ignore the transcription event
      lastMessageWasTextRef.current = true;

      // Send to backend
      wsClient.send({ type: 'text_message', text: trimmedText });
    },
    [state.connectionStatus]
  );

  // Pronounce a word using TTS (for flashcard pronunciation)
  const pronounceWord = useCallback(
    (text: string) => {
      const wsClient = wsClientRef.current;
      const ttsAudioPlayer = ttsAudioPlayerRef.current;
      const trimmedText = text.trim();

      if (state.connectionStatus !== 'connected' || !trimmedText) return;

      // Stop any currently playing TTS audio
      ttsAudioPlayer.stop();

      // Use the text itself as the card ID for tracking
      dispatch({ type: 'SET_PRONOUNCING_CARD_ID', payload: trimmedText });
      wsClient.send({
        type: 'tts_pronounce_request',
        text: trimmedText,
      });
    },
    [state.connectionStatus]
  );

  // Select a conversation from the sidebar
  const selectConversation = useCallback(
    (conversationId: string) => {
      const storage = storageRef.current;
      const audioHandler = audioHandlerRef.current;
      const audioPlayer = audioPlayerRef.current;
      const ttsAudioPlayer = ttsAudioPlayerRef.current;
      const wsClient = wsClientRef.current;

      // Stop any ongoing recording/playback and audio
      if (state.isRecording) {
        audioHandler.stopStreaming();
        dispatch({ type: 'SET_RECORDING', payload: false });
      }
      // Stop main audio playback (TTS responses)
      audioPlayer.stop();
      // Stop TTS audio playback (flashcard pronunciation)
      ttsAudioPlayer.stop();

      // Save current conversation first if it exists
      if (
        state.currentConversationId &&
        stateRef.current.chatHistory.length > 0
      ) {
        const messages = stateRef.current.chatHistory.map((m) => ({
          role: m.role === 'learner' ? 'user' : 'assistant',
          content: m.content,
          timestamp: new Date().toISOString(),
          feedback: m.feedback,
        })) as import('../types').ConversationMessage[];
        storage.saveConversation(
          state.currentConversationId,
          messages,
          state.currentLanguage
        );
      }

      // Find the conversation to get its language
      const conversation = stateRef.current.conversations.find(
        (c) => c.id === conversationId
      );
      const targetLanguage =
        conversation?.languageCode || state.currentLanguage;

      // Set language immediately (before waiting for backend response)
      // This ensures the language is correct right away, especially on page refresh
      if (targetLanguage !== state.currentLanguage) {
        dispatch({ type: 'SET_LANGUAGE', payload: targetLanguage });
        storage.saveLanguage(targetLanguage);
      }

      // Load the selected conversation data
      const conversationData = storage.getConversation(conversationId);

      // Send conversation_switch message to backend
      if (state.connectionStatus === 'connected') {
        // Stop all audio immediately when switching starts - do this FIRST
        audioHandler.stopStreaming();
        audioPlayer.stop();
        ttsAudioPlayer.stop();

        // Clear any pending audio streams by stopping again after a brief delay
        // This ensures any queued audio is also stopped
        setTimeout(() => {
          audioPlayer.stop();
          ttsAudioPlayer.stop();
        }, 50);

        // Show loading screen
        dispatch({ type: 'SET_SWITCHING_CONVERSATION', payload: true });

        // Don't update UI yet - wait for conversation_ready message
        // Send switch request to backend
        wsClient.send({
          type: 'conversation_switch',
          conversationId: conversationId,
          languageCode: targetLanguage,
          messages: conversationData?.messages || [],
        });

        // UI will be updated when conversation_ready is received
      } else {
        if (conversationData) {
          const chatHistory = conversationData.messages.map((m) => ({
            role: m.role === 'user' ? 'learner' : 'teacher',
            content: m.content,
            timestamp: m.timestamp,
            feedback: m.feedback,
          })) as ChatMessage[];
          dispatch({ type: 'SET_CHAT_HISTORY', payload: chatHistory });

          // Populate feedbackMap from message feedback fields (offline mode)
          const feedbackMap: Record<string, string> = {};
          for (const m of conversationData.messages) {
            if (m.feedback) {
              feedbackMap[m.content] = m.feedback;
            }
          }
          dispatch({ type: 'SET_FEEDBACK_MAP', payload: feedbackMap });
        } else {
          dispatch({ type: 'SET_CHAT_HISTORY', payload: [] });
          dispatch({ type: 'SET_FEEDBACK_MAP', payload: {} });
        }

        dispatch({
          type: 'SET_CURRENT_CONVERSATION_ID',
          payload: conversationId,
        });
        storage.setCurrentConversationId(conversationId);

        const flashcards = storage.getFlashcardsForConversation(conversationId);
        dispatch({ type: 'SET_FLASHCARDS', payload: flashcards });

        dispatch({ type: 'RESET_STREAMING_STATE' });
        pendingLLMResponseRef.current = null;
        lastMessageWasTextRef.current = false;
        pendingFlashcardsRef.current = [];
        dispatch({ type: 'SET_SWITCHING_CONVERSATION', payload: false });
      }

      // Close sidebar on mobile
      dispatch({ type: 'SET_SIDEBAR_OPEN', payload: false });
    },
    [
      state.isRecording,
      state.currentConversationId,
      state.currentLanguage,
      state.connectionStatus,
    ]
  );

  // Update ref so initialization can call selectConversation
  useEffect(() => {
    selectConversationRef.current = selectConversation;

    // If conversations haven't been loaded yet and we have conversations in state, load the current one
    if (
      !conversationsLoadedRef.current &&
      state.conversations.length > 0 &&
      selectConversationRef.current
    ) {
      const storage = storageRef.current;

      // Get the stored current conversation ID
      let currentId = storage.getCurrentConversationId();

      // If we have a stored conversation ID, verify it exists
      if (currentId) {
        const conversationExists = state.conversations.find(
          (c) => c.id === currentId
        );
        if (!conversationExists) {
          currentId = null;
        }
      }

      // If no stored conversation found, use the most recent one
      if (!currentId && state.conversations.length > 0) {
        currentId = state.conversations[0].id;
      }

      // Use selectConversation to load the conversation
      if (currentId) {
        selectConversationRef.current(currentId);
        conversationsLoadedRef.current = true;
      }
    }
  }, [selectConversation, state.conversations]);

  // Create a new conversation
  const createNewConversation = useCallback(() => {
    const storage = storageRef.current;
    const audioHandler = audioHandlerRef.current;
    const audioPlayer = audioPlayerRef.current;
    const ttsAudioPlayer = ttsAudioPlayerRef.current;
    const wsClient = wsClientRef.current;

    // Stop any ongoing recording/playback and audio
    if (state.isRecording) {
      audioHandler.stopStreaming();
      dispatch({ type: 'SET_RECORDING', payload: false });
    }
    // Stop main audio playback (TTS responses)
    audioPlayer.stop();
    // Stop TTS audio playback (flashcard pronunciation)
    ttsAudioPlayer.stop();

    // Save current conversation first if it exists
    if (
      state.currentConversationId &&
      stateRef.current.chatHistory.length > 0
    ) {
      const messages = stateRef.current.chatHistory.map((m) => ({
        role: m.role === 'learner' ? 'user' : 'assistant',
        content: m.content,
        timestamp: new Date().toISOString(),
        feedback: m.feedback,
      })) as import('../types').ConversationMessage[];
      storage.saveConversation(
        state.currentConversationId,
        messages,
        state.currentLanguage
      );
    }

    // Create new conversation with the language shown on the button (uiLanguage)
    // This ensures the new conversation uses the language the user selected/expects
    const languageForNewConversation = state.uiLanguage;
    const newConversation = storage.createConversation(
      languageForNewConversation
    );
    dispatch({ type: 'ADD_CONVERSATION', payload: newConversation });
    dispatch({
      type: 'SET_CURRENT_CONVERSATION_ID',
      payload: newConversation.id,
    });
    storage.setCurrentConversationId(newConversation.id);

    // Clear chat and flashcards (new conversation has no flashcards)
    dispatch({ type: 'RESET_CONVERSATION' });
    dispatch({ type: 'SET_FLASHCARDS', payload: [] });
    pendingLLMResponseRef.current = null;
    lastMessageWasTextRef.current = false;
    pendingFlashcardsRef.current = [];

    // For new conversations, send conversation_switch with empty messages
    if (state.connectionStatus === 'connected') {
      // Stop all audio immediately when switching starts - do this FIRST
      audioHandler.stopStreaming();
      audioPlayer.stop();
      ttsAudioPlayer.stop();

      // Clear any pending audio streams by stopping again after a brief delay
      setTimeout(() => {
        audioPlayer.stop();
        ttsAudioPlayer.stop();
      }, 50);

      dispatch({ type: 'SET_SWITCHING_CONVERSATION', payload: true });

      wsClient.send({
        type: 'conversation_switch',
        conversationId: newConversation.id,
        languageCode: languageForNewConversation,
        messages: [],
      });
    } else {
      dispatch({ type: 'SET_SWITCHING_CONVERSATION', payload: false });
    }

    // Close sidebar on mobile
    dispatch({ type: 'SET_SIDEBAR_OPEN', payload: false });
  }, [
    state.isRecording,
    state.currentConversationId,
    state.currentLanguage,
    state.uiLanguage,
    state.connectionStatus,
  ]);

  // Delete a conversation
  const deleteConversation = useCallback(
    (conversationId: string) => {
      const storage = storageRef.current;

      // Find the conversation to get its language code
      const conversation = stateRef.current.conversations.find(
        (c) => c.id === conversationId
      );
      const languageCode = conversation?.languageCode || state.currentLanguage;

      storage.deleteConversation(conversationId, languageCode);
      storage.clearFlashcardsForConversation(conversationId);
      dispatch({ type: 'REMOVE_CONVERSATION', payload: conversationId });

      // If we deleted the current conversation, switch to another or create new
      if (state.currentConversationId === conversationId) {
        const remainingConversations = stateRef.current.conversations.filter(
          (c) => c.id !== conversationId
        );

        if (remainingConversations.length > 0) {
          selectConversation(remainingConversations[0].id);
        } else {
          createNewConversation();
        }
      }
    },
    [
      state.currentLanguage,
      state.currentConversationId,
      selectConversation,
      createNewConversation,
    ]
  );

  // Rename a conversation
  const renameConversation = useCallback(
    (conversationId: string, newTitle: string) => {
      const storage = storageRef.current;
      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle) return;

      // Find the conversation to get its language code
      const conversation = stateRef.current.conversations.find(
        (c) => c.id === conversationId
      );
      const languageCode = conversation?.languageCode || state.currentLanguage;

      storage.renameConversation(conversationId, trimmedTitle, languageCode);
      dispatch({
        type: 'RENAME_CONVERSATION',
        payload: { id: conversationId, title: trimmedTitle },
      });
    },
    [state.currentLanguage]
  );

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    dispatch({
      type: 'SET_SIDEBAR_OPEN',
      payload: !stateRef.current.sidebarOpen,
    });
  }, []);

  // Use direct instances instead of refs for context value
  // These instances are stable and don't change, so accessing them during render is safe
  const value: AppContextType = useMemo(
    () => ({
      state,
      dispatch,
      storage: storageInstance,
      wsClient: wsClientInstance,
      audioHandler: audioHandlerInstance,
      audioPlayer: audioPlayerInstance,
      toggleRecording,
      changeUiLanguage,
      handleInterrupt,
      sendTextMessage,
      pronounceWord,
      selectConversation,
      createNewConversation,
      deleteConversation,
      renameConversation,
      toggleSidebar,
    }),
    [
      state,
      dispatch,
      storageInstance,
      wsClientInstance,
      audioHandlerInstance,
      audioPlayerInstance,
      toggleRecording,
      changeUiLanguage,
      handleInterrupt,
      sendTextMessage,
      pronounceWord,
      selectConversation,
      createNewConversation,
      deleteConversation,
      renameConversation,
      toggleSidebar,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
