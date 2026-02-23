import 'dotenv/config';

import {
  GraphBuilder,
  CustomNode,
  ProcessContext,
  RemoteLLMChatNode,
  Graph,
} from '@inworld/runtime/graph';
import { GraphTypes } from '@inworld/runtime/common';
import { PromptBuilder } from '@inworld/runtime/primitives/llm';
import { flashcardPromptTemplate } from '../helpers/prompt-templates.js';
import { v4 } from 'uuid';
import { Flashcard } from '../helpers/flashcard-processor.js';
import { llmConfig } from '../config/llm.js';
import { flashcardLogger as logger } from '../utils/logger.js';
import { jsonrepair } from 'jsonrepair';

class FlashcardPromptBuilderNode extends CustomNode {
  async process(
    _context: ProcessContext,
    input: GraphTypes.Content | Record<string, unknown>
  ) {
    const builder = await PromptBuilder.create(flashcardPromptTemplate);
    const renderedPrompt = await builder.build(
      input as Record<string, unknown>
    );
    return renderedPrompt;
  }
}

class TextToChatRequestNode extends CustomNode {
  process(_context: ProcessContext, renderedPrompt: string) {
    return new GraphTypes.LLMChatRequest({
      messages: [{ role: 'user', content: renderedPrompt }],
    });
  }
}

class FlashcardParserNode extends CustomNode {
  process(_context: ProcessContext, input: GraphTypes.Content) {
    const content =
      (input &&
        typeof input === 'object' &&
        'content' in input &&
        (input as { content?: unknown }).content) ||
      input;
    const textContent =
      typeof content === 'string' ? content : JSON.stringify(content);

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const raw = jsonMatch[0];
      let parsed: Record<string, string> | undefined;

      try {
        parsed = JSON.parse(raw);
      } catch {
        try {
          parsed = JSON.parse(jsonrepair(raw));
          logger.warn(
            { raw: raw.slice(0, 500) },
            'flashcard_json_repaired'
          );
        } catch (repairError) {
          logger.error(
            { raw: raw.slice(0, 500), err: repairError },
            'failed_to_parse_flashcard_json'
          );
        }
      }

      if (parsed) {
        const result: Record<string, unknown> = {
          id: v4(),
          targetWord: parsed.targetWord ?? parsed.spanish ?? '',
          english: parsed.english ?? '',
          example: parsed.example ?? '',
          mnemonic: parsed.mnemonic ?? '',
          timestamp: new Date().toISOString(),
        };
        if (parsed.exampleTranslation) result.exampleTranslation = parsed.exampleTranslation;
        if (parsed.pinyin) result.pinyin = parsed.pinyin;
        if (parsed.examplePinyin) result.examplePinyin = parsed.examplePinyin;
        return result;
      }
    }

    return {
      id: v4(),
      targetWord: '',
      english: '',
      example: '',
      mnemonic: '',
      timestamp: new Date().toISOString(),
      error: 'Failed to generate flashcard',
    } as Flashcard;
  }
}

/**
 * Creates a flashcard generation graph (language-agnostic)
 */
function createFlashcardGraph(): Graph {
  const apiKey = process.env.INWORLD_API_KEY;
  if (!apiKey) {
    throw new Error('INWORLD_API_KEY environment variable is required');
  }

  const promptBuilderNode = new FlashcardPromptBuilderNode({
    id: 'flashcard-prompt-builder',
  });
  const textToChatRequestNode = new TextToChatRequestNode({
    id: 'text-to-chat-request',
  });
  const llmNode = new RemoteLLMChatNode({
    id: 'llm_node',
    provider: llmConfig.flashcard.provider,
    modelName: llmConfig.flashcard.model,
    stream: llmConfig.flashcard.stream,
    textGenerationConfig: llmConfig.flashcard.textGenerationConfig,
  });
  const parserNode = new FlashcardParserNode({ id: 'flashcard-parser' });

  const executor = new GraphBuilder({
    id: 'flashcard-generation-graph',
    enableRemoteConfig: false,
  })
    .addNode(promptBuilderNode)
    .addNode(textToChatRequestNode)
    .addNode(llmNode)
    .addNode(parserNode)
    .addEdge(promptBuilderNode, textToChatRequestNode)
    .addEdge(textToChatRequestNode, llmNode)
    .addEdge(llmNode, parserNode)
    .setStartNode(promptBuilderNode)
    .setEndNode(parserNode)
    .build();

  return executor;
}

// Cache for the single flashcard graph instance
let flashcardGraph: Graph | null = null;

/**
 * Get or create the flashcard graph (language-agnostic, uses input params for language)
 */
export function getFlashcardGraph(): Graph {
  if (!flashcardGraph) {
    logger.info('creating_flashcard_graph');
    flashcardGraph = createFlashcardGraph();
  }
  return flashcardGraph;
}
