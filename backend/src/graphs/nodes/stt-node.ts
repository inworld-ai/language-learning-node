/**
 * Common interface for STT (Speech-to-Text) nodes.
 * Both AssemblyAI and Soniox implementations conform to this interface
 * so they can be used interchangeably in the conversation graph.
 */
export interface STTNode {
  closeSession(sessionId: string): Promise<void>;
  destroy(): Promise<void>;
}
