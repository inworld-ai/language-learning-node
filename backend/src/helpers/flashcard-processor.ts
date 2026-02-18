import { v4 } from 'uuid';
import { Graph } from '@inworld/runtime/graph';
import { GraphTypes } from '@inworld/runtime/common';
import { UserContextInterface } from '@inworld/runtime/graph';
import { getFlashcardGraph } from '../graphs/flashcard-graph.js';
import {
  LanguageConfig,
  getLanguageConfig,
  DEFAULT_LANGUAGE_CODE,
} from '../config/languages.js';
import { flashcardLogger as logger } from '../utils/logger.js';

export interface Flashcard {
  id: string;
  targetWord: string; // The word in the target language (was 'spanish')
  english: string;
  example: string;
  mnemonic: string;
  timestamp: string;
  languageCode?: string; // Track which language this card belongs to
}

export interface ConversationMessage {
  role: string;
  content: string;
}

export class FlashcardProcessor {
  private existingFlashcards: Flashcard[] = [];
  private languageCode: string = DEFAULT_LANGUAGE_CODE;
  private languageConfig: LanguageConfig;

  constructor(languageCode: string = DEFAULT_LANGUAGE_CODE) {
    this.languageCode = languageCode;
    this.languageConfig = getLanguageConfig(languageCode);
  }

  /**
   * Update the language for this processor
   */
  setLanguage(languageCode: string): void {
    if (this.languageCode !== languageCode) {
      this.languageCode = languageCode;
      this.languageConfig = getLanguageConfig(languageCode);
      logger.info({ language: this.languageConfig.name }, 'language_changed');
    }
  }

  /**
   * Get current language code
   */
  getLanguageCode(): string {
    return this.languageCode;
  }

  async generateFlashcards(
    messages: ConversationMessage[],
    count: number = 1,
    userContext?: UserContextInterface,
    languageCodeOverride?: string
  ): Promise<Flashcard[]> {
    const executor = getFlashcardGraph();

    // Use override language if provided (snapshotted from processing start time),
    // otherwise fall back to processor's current language
    const effectiveLanguageCode = languageCodeOverride || this.languageCode;
    const effectiveLanguageConfig = languageCodeOverride
      ? getLanguageConfig(languageCodeOverride)
      : this.languageConfig;

    // Generate flashcards in parallel
    const promises: Promise<Flashcard>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        this.generateSingleFlashcard(
          executor,
          messages,
          userContext,
          effectiveLanguageCode,
          effectiveLanguageConfig
        )
      );
    }

    try {
      const flashcards = await Promise.all(promises);

      // Filter out any failed generations and duplicates
      const validFlashcards = flashcards.filter(
        (card) => card.targetWord && card.english
      );

      // Add to existing flashcards to track for future duplicates
      this.existingFlashcards.push(...validFlashcards);

      return validFlashcards;
    } catch (error) {
      logger.error({ err: error }, 'flashcard_batch_generation_error');
      return [];
    }
  }

  private async generateSingleFlashcard(
    executor: Graph,
    messages: ConversationMessage[],
    userContext?: UserContextInterface,
    languageCode?: string,
    languageConfig?: LanguageConfig
  ): Promise<Flashcard> {
    // Use explicitly passed language (snapshotted at trigger time) to avoid
    // reading from mutable this.languageCode which may change during async work
    const effectiveLanguageCode = languageCode || this.languageCode;
    const effectiveLanguageConfig = languageConfig || this.languageConfig;

    try {
      const input = {
        studentName: 'Student',
        teacherName: effectiveLanguageConfig.teacherPersona.name,
        target_language: effectiveLanguageConfig.name,
        messages: messages,
        flashcards: this.existingFlashcards,
      };

      let executionResult;
      try {
        const executionContext = {
          executionId: v4(),
          userContext: userContext,
        };
        executionResult = await executor.start(input, executionContext);
      } catch (err) {
        logger.warn({ err }, 'executor_start_with_context_failed_falling_back');
        executionResult = await executor.start(input);
      }
      let finalData: GraphTypes.Content | null = null;
      for await (const res of executionResult.outputStream) {
        finalData = res.data;
      }
      const flashcard = finalData as unknown as Flashcard;

      flashcard.languageCode = effectiveLanguageCode;

      // Check if this is a duplicate
      const isDuplicate = this.existingFlashcards.some(
        (existing) =>
          existing.targetWord?.toLowerCase() ===
          flashcard.targetWord?.toLowerCase()
      );

      if (isDuplicate) {
        return {
          id: v4(),
          targetWord: '',
          english: '',
          example: '',
          mnemonic: '',
          timestamp: new Date().toISOString(),
          languageCode: effectiveLanguageCode,
        } as Flashcard & { error?: string };
      }

      return flashcard;
    } catch (error) {
      logger.error({ err: error }, 'single_flashcard_generation_error');
      return {
        id: v4(),
        targetWord: '',
        english: '',
        example: '',
        mnemonic: '',
        timestamp: new Date().toISOString(),
        languageCode: effectiveLanguageCode,
      } as Flashcard & { error?: string };
    }
  }

  // Reset flashcards when starting a new conversation
  reset() {
    this.existingFlashcards = [];
  }

  // Get all existing flashcards
  getExistingFlashcards(): Flashcard[] {
    return this.existingFlashcards;
  }
}
