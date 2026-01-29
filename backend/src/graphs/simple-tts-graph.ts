/**
 * Simple TTS Graph
 *
 * A lightweight graph that takes text and produces TTS audio.
 * Used for pronouncing individual words (e.g., flashcard pronunciation).
 *
 * Graph Flow:
 * Input { text } → TextExtractor → RemoteTTS → Audio Output
 *
 * RemoteTTSNode accepts String directly as input, so we just need to
 * extract the text from our input object.
 */

import {
  Graph,
  GraphBuilder,
  CustomNode,
  ProcessContext,
  RemoteTTSNode,
} from '@inworld/runtime/graph';
import {
  getLanguageConfig,
  getSupportedLanguageCodes,
} from '../config/languages.js';
import { serverConfig } from '../config/server.js';
import { graphLogger as logger } from '../utils/logger.js';

export interface SimpleTTSInput {
  text: string;
}

/**
 * Simple node that extracts text string from input object
 */
class TextExtractorNode extends CustomNode {
  process(_context: ProcessContext, input: SimpleTTSInput): string {
    logger.info({ text: input.text }, 'simple_tts_extracting_text');
    return input.text;
  }
}

/**
 * Creates a simple TTS graph for pronouncing words
 * RemoteTTSNode accepts String directly as input
 */
function createSimpleTTSGraph(languageCode: string): Graph {
  const langConfig = getLanguageConfig(languageCode);

  logger.info(
    {
      languageCode,
      speakerId: langConfig.ttsConfig.speakerId,
      modelId: langConfig.ttsConfig.modelId,
    },
    'creating_simple_tts_graph_with_config'
  );

  const textExtractorNode = new TextExtractorNode({
    id: `simple-tts-text-extractor-${languageCode}`,
  });

  // RemoteTTSNode accepts String directly as input
  const ttsNode = new RemoteTTSNode({
    id: `simple-tts-node-${languageCode}`,
    speakerId: langConfig.ttsConfig.speakerId,
    modelId: langConfig.ttsConfig.modelId,
    sampleRate: serverConfig.audio.ttsSampleRate,
    temperature: langConfig.ttsConfig.temperature,
    speakingRate: langConfig.ttsConfig.speakingRate,
    languageCode: langConfig.ttsConfig.languageCode,
    reportToClient: true,
  });

  const graphBuilder = new GraphBuilder({
    id: `simple-tts-graph-${languageCode}`,
    enableRemoteConfig: false,
  });

  graphBuilder
    .addNode(textExtractorNode)
    .addNode(ttsNode)
    .addEdge(textExtractorNode, ttsNode)
    .setStartNode(textExtractorNode)
    .setEndNode(ttsNode);

  return graphBuilder.build();
}

// Cache for simple TTS graphs per language
const simpleTTSGraphs = new Map<string, Graph>();

/**
 * Initialize TTS graphs for all supported languages
 */
export function initializeTTSGraphs(): void {
  const languageCodes = getSupportedLanguageCodes();

  logger.info(
    { languageCount: languageCodes.length },
    'initializing_tts_graphs'
  );

  for (const languageCode of languageCodes) {
    if (!simpleTTSGraphs.has(languageCode)) {
      logger.info({ languageCode }, 'creating_tts_graph');
      simpleTTSGraphs.set(languageCode, createSimpleTTSGraph(languageCode));
    }
  }

  logger.info({ graphCount: simpleTTSGraphs.size }, 'tts_graphs_initialized');
}

/**
 * Get TTS graph for a specific language
 */
export function getSimpleTTSGraph(languageCode: string): Graph {
  // If graph doesn't exist, create it (fallback for new languages)
  if (!simpleTTSGraphs.has(languageCode)) {
    logger.info({ languageCode }, 'creating_tts_graph_on_demand');
    simpleTTSGraphs.set(languageCode, createSimpleTTSGraph(languageCode));
  }
  return simpleTTSGraphs.get(languageCode)!;
}
