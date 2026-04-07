/**
 * TurnMemory — sliding window of recent conversation turns.
 *
 * Keeps the last N turns in memory for fast context injection into
 * session instructions. Non-blocking: callers never await this.
 *
 * Optionally persists to Supabase for cross-session memory retrieval.
 */

import { createLogger } from '../utils/logger.js';
import { MemoryService } from './memory-service.js';

const logger = createLogger('TurnMemory');

interface Turn {
  role: string;
  content: string;
  timestamp: number;
}

export class TurnMemory {
  private turns: Turn[] = [];
  private maxTurns: number;
  private memoryService: MemoryService | null = null;
  private userId: string | null = null;
  private languageCode: string = 'es';

  constructor(maxTurns: number = 5) {
    this.maxTurns = maxTurns;
  }

  /** Wire up Supabase persistence (optional) */
  setMemoryService(service: MemoryService, userId: string): void {
    this.memoryService = service;
    this.userId = userId;
  }

  setLanguageCode(code: string): void {
    this.languageCode = code;
  }

  /** Add a turn. Evicts oldest if over capacity. Non-blocking persist. */
  add(role: string, content: string): void {
    this.turns.push({ role, content, timestamp: Date.now() });

    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }

    // Fire-and-forget: persist to Supabase every 3 turns
    if (this.turns.length > 0 && this.turns.length % 3 === 0) {
      this.persistAsync().catch((err) =>
        logger.warn({ err }, 'memory_persist_failed'),
      );
    }
  }

  /** Format recent turns as context string for injection into instructions */
  getContext(): string {
    if (this.turns.length === 0) return '';

    return this.turns
      .map((t) => `${t.role}: ${t.content}`)
      .join('\n');
  }

  /** Retrieve relevant memories from Supabase for the current query */
  async retrieveRelevant(query: string): Promise<string[]> {
    if (!this.memoryService || !this.userId) return [];

    try {
      return await this.memoryService.retrieve(this.userId, query);
    } catch (err) {
      logger.warn({ err }, 'memory_retrieval_failed');
      return [];
    }
  }

  clear(): void {
    this.turns = [];
  }

  getTurnCount(): number {
    return this.turns.length;
  }

  getMessages(): Array<{ role: string; content: string }> {
    return this.turns.map(({ role, content }) => ({ role, content }));
  }

  // ── Private ──────────────────────────────────────────────

  /** Persist a memory summary to Supabase (non-blocking) */
  private async persistAsync(): Promise<void> {
    if (!this.memoryService || !this.userId) return;

    const recentMessages = this.turns.map(({ role, content }) => ({
      role,
      content,
    }));

    await this.memoryService.generateAndStore(
      this.userId,
      recentMessages,
      this.languageCode,
    );
  }
}
