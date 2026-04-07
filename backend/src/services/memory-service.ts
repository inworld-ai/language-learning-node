/**
 * MemoryService — generates and stores conversation memories in Supabase.
 *
 * Uses Inworld LLM completions API to extract memorable facts,
 * then stores them in Supabase pgvector for cross-session semantic retrieval.
 *
 * All generation operations are non-blocking (fire-and-forget from the caller).
 */

import { getSupabaseClient, isSupabaseConfigured } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import type {
  MemoryRecord,
  MemoryMatch,
  MemoryType,
  SupabaseMemoryRow,
} from '../types/memory.js';
import { VALID_MEMORY_TYPES } from '../types/memory.js';

const logger = createLogger('MemoryService');

const INWORLD_LLM_URL =
  'https://api.inworld.ai/v1/chat/completions';

function validateMemoryType(type: string): MemoryType {
  if (VALID_MEMORY_TYPES.includes(type as MemoryType)) {
    return type as MemoryType;
  }
  return 'personal_context';
}

export class MemoryService {
  /**
   * Generate a memory from recent messages and store it in Supabase.
   * Entirely non-blocking — caller should fire-and-forget.
   */
  async generateAndStore(
    userId: string,
    messages: Array<{ role: string; content: string }>,
    languageCode: string,
  ): Promise<void> {
    if (!isSupabaseConfigured() || !process.env.INWORLD_API_KEY) return;

    try {
      const memoryOutput = await this.generateMemory(messages, languageCode);
      if (!memoryOutput || !memoryOutput.memory) return;

      await this.storeMemory({
        userId,
        content: memoryOutput.memory,
        memoryType: validateMemoryType(memoryOutput.type),
        topics: memoryOutput.topics || [],
        importance: memoryOutput.importance || 0.5,
      });
    } catch (err) {
      logger.warn({ err }, 'generate_and_store_failed');
    }
  }

  /**
   * Retrieve relevant memories as formatted strings.
   * Falls back to recent memories if no embedding search available.
   */
  async retrieve(userId: string, _query: string): Promise<string[]> {
    if (!isSupabaseConfigured()) return [];

    try {
      const memories = await this.getUserMemories(userId, 5);
      return memories.map((m) => m.content);
    } catch (err) {
      logger.warn({ err }, 'memory_retrieve_failed');
      return [];
    }
  }

  async storeMemory(memory: MemoryRecord): Promise<string | null> {
    if (!isSupabaseConfigured()) {
      logger.debug('supabase_not_configured_skipping_store');
      return null;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) return null;

      const embeddingStr = memory.embedding
        ? `[${memory.embedding.join(',')}]`
        : null;

      const { data, error } = await supabase
        .from('user_memories')
        .insert({
          user_id: memory.userId,
          content: memory.content,
          memory_type: memory.memoryType,
          topics: memory.topics,
          importance: memory.importance,
          embedding: embeddingStr,
        })
        .select('id')
        .single();

      if (error) {
        logger.error({ err: error }, 'failed_to_store_memory');
        return null;
      }

      logger.info(
        { memoryId: data.id, type: memory.memoryType },
        'memory_stored',
      );
      return data.id;
    } catch (error) {
      logger.error({ err: error }, 'memory_store_exception');
      return null;
    }
  }

  async retrieveMemories(
    userId: string,
    queryEmbedding: number[],
    limit: number = 3,
    threshold: number = 0.7,
  ): Promise<MemoryMatch[]> {
    if (!isSupabaseConfigured()) return [];

    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      const { data, error } = await supabase.rpc('match_memories', {
        query_embedding: embeddingStr,
        match_user_id: userId,
        match_threshold: threshold,
        match_count: limit,
      });

      if (error) {
        logger.error({ err: error }, 'failed_to_retrieve_memories');
        return [];
      }

      return (data || []).map((row: SupabaseMemoryRow) => ({
        id: row.id,
        content: row.content,
        memoryType: validateMemoryType(row.memory_type),
        topics: row.topics || [],
        importance: row.importance,
        similarity: row.similarity ?? 0,
      }));
    } catch (error) {
      logger.error({ err: error }, 'memory_retrieve_exception');
      return [];
    }
  }

  async getUserMemories(
    userId: string,
    limit: number = 50,
  ): Promise<MemoryRecord[]> {
    if (!isSupabaseConfigured()) return [];

    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('user_memories')
        .select('id, content, memory_type, topics, importance, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ err: error }, 'failed_to_get_user_memories');
        return [];
      }

      return (data || []).map((row: SupabaseMemoryRow) => ({
        id: row.id,
        userId,
        content: row.content,
        memoryType: validateMemoryType(row.memory_type),
        topics: row.topics || [],
        importance: row.importance,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error({ err: error }, 'get_user_memories_exception');
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;

    const supabase = getSupabaseClient();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('user_memories')
        .delete()
        .eq('id', memoryId);

      if (error) {
        logger.error({ err: error, memoryId }, 'failed_to_delete_memory');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ err: error }, 'delete_memory_exception');
      return false;
    }
  }

  // ── Private ──────────────────────────────────────────────

  private async generateMemory(
    messages: Array<{ role: string; content: string }>,
    languageCode: string,
  ): Promise<{
    memory: string;
    type: string;
    topics: string[];
    importance: number;
  } | null> {
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `You are analyzing a language learning conversation to extract memorable facts about the user.

Conversation context (${languageCode} learning session):
${conversationText}

Based on this conversation, create ONE concise memory about the user in English. Focus on:
- Learning progress: vocabulary struggles, grammar issues, topics covered, skill improvements
- Personal context: interests, goals, preferences, life details they shared

Output format (JSON only):
{"memory": "The user [specific fact]", "type": "learning_progress", "topics": ["topic1"], "importance": 0.5}

Rules:
- Memory must be in English
- Keep it factual, specific, and concise (1-2 sentences)
- If nothing memorable was said, return: {"memory": "", "type": "personal_context", "topics": [], "importance": 0}
- Return ONLY the JSON object`;

    try {
      const response = await fetch(INWORLD_LLM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${process.env.INWORLD_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-nano',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status },
          'memory_generation_llm_failed',
        );
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) return null;

      return JSON.parse(text);
    } catch (err) {
      logger.warn({ err }, 'memory_generation_parse_failed');
      return null;
    }
  }
}

// Singleton
let instance: MemoryService | null = null;
export function getMemoryService(): MemoryService {
  if (!instance) instance = new MemoryService();
  return instance;
}
