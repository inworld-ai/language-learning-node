export const serverConfig = {
  port: Number(process.env.PORT) || 3000,

  audio: {
    inputSampleRate: 24000,
    outputSampleRate: 24000,
  },

  /** Semantic VAD eagerness for Inworld Realtime */
  vadEagerness: (process.env.VAD_EAGERNESS || 'low') as  // low = patient, allows thinking pauses (good for language learning)
    | 'low'
    | 'medium'
    | 'high',

  /** Inworld Realtime WebSocket endpoint */
  inworldRealtimeUrl:
    process.env.INWORLD_REALTIME_URL ||
    'wss://api.inworld.ai/api/v1/realtime/session',

  /** TTS voice model */
  ttsModel: process.env.TTS_MODEL || 'inworld-tts-2',
} as const;
