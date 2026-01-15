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
import { getLanguageConfig } from '../config/languages.js';
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
 * Language is hardcoded to Spanish
 */
function createSimpleTTSGraph(languageCode: string): Graph {
  // Language is hardcoded to Spanish, ignore parameter
  const langConfig = getLanguageConfig('es');

  logger.info(
    {
      languageCode,
      speakerId: langConfig.ttsConfig.speakerId,
      modelId: langConfig.ttsConfig.modelId,
    },
    'creating_simple_tts_graph_with_config'
  );

  const textExtractorNode = new TextExtractorNode({
    id: 'simple-tts-text-extractor',
  });

  // RemoteTTSNode accepts String directly as input
  const ttsNode = new RemoteTTSNode({
    id: 'simple-tts-node',
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

// Cache for simple TTS graph (always Spanish)
let simpleTTSGraph: Graph | null = null;

/**
 * Get or create a simple TTS graph (always Spanish)
 */
export function getSimpleTTSGraph(languageCode: string): Graph {
  // Language is hardcoded to Spanish, ignore parameter
  if (!simpleTTSGraph) {
    logger.info({ languageCode: 'es' }, 'creating_simple_tts_graph');
    simpleTTSGraph = createSimpleTTSGraph('es');
  }
  return simpleTTSGraph;
}
