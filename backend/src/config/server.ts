/**
 * Server Configuration
 *
 * Centralized configuration for server settings, audio processing, and external services.
 * Environment variables can override defaults where appropriate.
 */

export interface InworldSTTSettings {
  silenceThresholdMs: number;
  minSpeechMs: number;
  silenceEnergyThreshold: number;
  description: string;
}

export type InworldSTTEagerness = 'low' | 'medium' | 'high';

/**
 * Inworld STT VAD presets controlling how eagerly the system ends a turn.
 * These mirror the former AssemblyAI turn-detection presets so existing
 * environment-variable overrides (INWORLD_STT_EAGERNESS) behave predictably.
 */
const inworldSTTPresets: Record<InworldSTTEagerness, InworldSTTSettings> = {
  /**
   * Aggressive - Quick responses for rapid back-and-forth
   * Use cases: Agent Assist, IVR replacements, Retail/E-commerce, Telecom
   */
  high: {
    silenceThresholdMs: 400,
    minSpeechMs: 100,
    silenceEnergyThreshold: 0.01,
    description:
      'Aggressive - Quick responses for rapid back-and-forth (IVR, order confirmations)',
  },

  /**
   * Balanced - Natural middle ground for most conversational turns
   * Use cases: Customer Support, Tech Support, Financial Services, Travel
   */
  medium: {
    silenceThresholdMs: 700,
    minSpeechMs: 150,
    silenceEnergyThreshold: 0.01,
    description: 'Balanced - Natural middle ground for most conversational turns',
  },

  /**
   * Conservative - Patient, allows thinking pauses
   * Use cases: Healthcare, Mental Health, Sales, Legal, Language Learning
   */
  low: {
    silenceThresholdMs: 1000,
    minSpeechMs: 200,
    silenceEnergyThreshold: 0.01,
    description:
      'Conservative - Patient, allows thinking pauses (Language Learning, Healthcare)',
  },
};

export const serverConfig = {
  /**
   * HTTP server port
   */
  port: Number(process.env.PORT) || 3000,

  /**
   * Audio processing settings
   */
  audio: {
    /** Input sample rate from microphone (Hz) */
    inputSampleRate: 16000,
    /** TTS output sample rate (Hz) - Inworld TTS standard */
    ttsSampleRate: 22050,
  },

  /**
   * Inworld STT configuration
   */
  inworldSTT: {
    /** VAD eagerness level */
    eagerness: (process.env.INWORLD_STT_EAGERNESS ||
      'high') as InworldSTTEagerness,
  },

  /**
   * Telemetry configuration for Inworld Runtime
   */
  telemetry: {
    appName: 'inworld-language-tutor',
    appVersion: '1.0.0',
  },
} as const;

/**
 * Get Inworld STT VAD settings for the configured eagerness level
 */
export function getInworldSTTSettings(): InworldSTTSettings {
  return inworldSTTPresets[serverConfig.inworldSTT.eagerness];
}

/**
 * Get Inworld STT VAD settings for a specific eagerness level
 * @param eagerness - The eagerness level ('low' | 'medium' | 'high')
 */
export function getInworldSTTSettingsForEagerness(
  eagerness: InworldSTTEagerness
): InworldSTTSettings {
  return inworldSTTPresets[eagerness];
}
