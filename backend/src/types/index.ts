/**
 * Types for the Inworld Realtime API architecture
 */

/**
 * Chat message in conversation history
 */
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Re-export memory types for convenience
export type {
  MemoryType,
  MemoryRecord,
  MemoryMatch,
  SupabaseMemoryRow,
} from './memory.js';
export { VALID_MEMORY_TYPES } from './memory.js';
