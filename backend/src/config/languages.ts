/**
 * Language Configuration System
 *
 * This module provides a centralized configuration for all supported languages.
 * To add a new language:
 * 1. Add a new entry to SUPPORTED_LANGUAGES with all required fields
 * 2. The rest of the app will automatically support the new language
 */

import { createLogger } from '../utils/logger.js';
import type { STTProvider } from './server.js';

const logger = createLogger('Languages');

export interface TeacherPersona {
  name: string;
  age: number;
  nationality: string;
  description: string;
}

export interface TTSConfig {
  speakerId: string;
  modelId: string;
  speakingRate: number;
  temperature: number;
  languageCode?: string; // Optional TTS language code (e.g., 'ja-JP')
}

export interface LanguageConfig {
  // Identifier
  code: string; // e.g., 'es', 'ja', 'fr'

  // Display names
  name: string; // English name: "Spanish"
  nativeName: string; // Native name: "Español"
  flag: string; // Emoji flag

  // STT configuration
  sttLanguageCode: string; // Language code for speech-to-text

  // TTS configuration
  ttsConfig: TTSConfig;

  // Teacher persona for this language
  teacherPersona: TeacherPersona;

  // Example conversation topics specific to this language's culture
  exampleTopics: string[];

  // If set, this language is only available when the given STT provider is active
  requiredSttProvider?: STTProvider;
}

/**
 * Supported Languages Configuration
 *
 * Each language defines everything needed for:
 * - Speech recognition (STT)
 * - Text-to-speech (TTS)
 * - Teacher persona and conversation style
 * - Cultural context and example topics
 */
export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    sttLanguageCode: 'en-US',
    ttsConfig: {
      speakerId: 'Ashley',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'en-US',
    },
    teacherPersona: {
      name: 'Ms. Sarah Mitchell',
      age: 34,
      nationality: 'American (New York)',
      description:
        'a 34 year old New Yorker who loves teaching English through everyday conversations and pop culture',
    },
    exampleTopics: [
      'New York City life',
      'American movies and TV shows',
      'sports and outdoor activities',
      'American idioms and slang',
      'travel across the United States',
    ],
  },

  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇲🇽',
    sttLanguageCode: 'es-MX', // Mexican Spanish
    ttsConfig: {
      speakerId: 'Rafael',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'es-MX',
    },
    teacherPersona: {
      name: 'Señor Gael Herrera',
      age: 35,
      nationality: 'Mexican (Chilango)',
      description:
        "a 35 year old 'Chilango' (from Mexico City) who has loaned their brain to AI",
    },
    exampleTopics: [
      'Mexico City',
      'the Dunedin sound rock scene',
      'gardening',
      'the concept of brunch across cultures',
      'Balkan travel',
    ],
  },

  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    sttLanguageCode: 'fr-FR',
    ttsConfig: {
      speakerId: 'Alain',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'fr-FR',
    },
    teacherPersona: {
      name: 'Monsieur Lucien Dubois',
      age: 38,
      nationality: 'French (Parisian)',
      description:
        'a 38 year old Parisian who is passionate about French language, literature, and gastronomy',
    },
    exampleTopics: [
      'Parisian cafés and culture',
      'French cinema (nouvelle vague)',
      'wine regions and gastronomy',
      'French literature and philosophy',
      'travel in Provence and the French Riviera',
      'French music from Édith Piaf to modern artists',
    ],
  },

  de: {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    sttLanguageCode: 'de-DE',
    ttsConfig: {
      speakerId: 'Josef',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 0.7,
      languageCode: 'de-DE',
    },
    teacherPersona: {
      name: 'Herr Klaus Weber',
      age: 45,
      nationality: 'German (Berlin)',
      description:
        'a 45 year old Berliner who enjoys teaching German through history, philosophy, and modern culture',
    },
    exampleTopics: [
      'Berlin history and reunification',
      'German beer and food culture',
      'classical music and composers',
      'German engineering and innovation',
      'traveling through Bavaria and the Alps',
      'German literature from Goethe to modern authors',
    ],
  },

  it: {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    sttLanguageCode: 'it-IT',
    ttsConfig: {
      speakerId: 'Orietta',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'it-IT',
    },
    teacherPersona: {
      name: 'Signora Maria Rossi',
      age: 40,
      nationality: 'Italian (Roman)',
      description:
        'a 40 year old Roman who is passionate about Italian art, cuisine, and la dolce vita',
    },
    exampleTopics: [
      'Roman history and ancient sites',
      'Italian cuisine and regional specialties',
      'Renaissance art and architecture',
      'Italian cinema and neorealism',
      'fashion and design in Milan',
      'Italian music from opera to modern pop',
    ],
  },

  pt: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇧🇷',
    sttLanguageCode: 'pt-BR', // Brazilian Portuguese
    ttsConfig: {
      speakerId: 'Heitor',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 0.7,
      languageCode: 'pt-BR',
    },
    teacherPersona: {
      name: 'Senhor João Silva',
      age: 36,
      nationality: 'Brazilian (Carioca)',
      description:
        'a 36 year old Carioca from Rio de Janeiro who loves sharing Brazilian culture, music, and the joy of Portuguese',
    },
    exampleTopics: [
      'Rio de Janeiro and Brazilian beaches',
      'Brazilian music from bossa nova to funk',
      'Carnival and Brazilian festivals',
      'Brazilian cuisine and churrasco',
      'football (soccer) culture',
      'the Amazon and Brazilian nature',
    ],
  },

  zh: {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    sttLanguageCode: 'zh-CN',
    ttsConfig: {
      speakerId: 'Xiaoyin',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'zh-CN',
    },
    teacherPersona: {
      name: '李老师 (Lǐ Lǎoshī)',
      age: 33,
      nationality: 'Chinese (Beijing)',
      description:
        'a 33 year old Beijinger who loves teaching Mandarin through Chinese culture, food, and modern life',
    },
    exampleTopics: [
      'life in Beijing and Shanghai',
      'Chinese cuisine and regional flavors',
      'Chinese festivals and traditions',
      'modern Chinese pop culture',
      'travel along the Silk Road',
    ],
    requiredSttProvider: 'soniox',
  },

  ja: {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    sttLanguageCode: 'ja-JP',
    ttsConfig: {
      speakerId: 'Asuka',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'ja-JP',
    },
    teacherPersona: {
      name: '田中先生 (Tanaka-sensei)',
      age: 31,
      nationality: 'Japanese (Tokyo)',
      description:
        'a 31 year old Tokyoite who is passionate about teaching Japanese through anime, food, and everyday life',
    },
    exampleTopics: [
      'daily life in Tokyo',
      'Japanese cuisine from ramen to kaiseki',
      'anime and manga culture',
      'Japanese seasons and festivals',
      'travel through Kyoto and rural Japan',
    ],
    requiredSttProvider: 'soniox',
  },

  ko: {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    sttLanguageCode: 'ko-KR',
    ttsConfig: {
      speakerId: 'Seojun',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'ko-KR',
    },
    teacherPersona: {
      name: '김선생님 (Kim Seonsaengnim)',
      age: 29,
      nationality: 'Korean (Seoul)',
      description:
        'a 29 year old Seoulite who enjoys teaching Korean through K-pop, K-drama, and Korean street food culture',
    },
    exampleTopics: [
      'life in Seoul and Busan',
      'Korean food and street food culture',
      'K-pop and K-drama',
      'Korean traditions and holidays',
      'travel through South Korea',
    ],
    requiredSttProvider: 'soniox',
  },

  ru: {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    sttLanguageCode: 'ru-RU',
    ttsConfig: {
      speakerId: 'Elena',
      modelId: 'inworld-tts-1.5-max',
      speakingRate: 1,
      temperature: 1.1,
      languageCode: 'ru-RU',
    },
    teacherPersona: {
      name: 'Елена Петровна (Elena Petrovna)',
      age: 37,
      nationality: 'Russian (Moscow)',
      description:
        'a 37 year old Muscovite who loves teaching Russian through literature, history, and the richness of Russian culture',
    },
    exampleTopics: [
      'life in Moscow and Saint Petersburg',
      'Russian literature and poetry',
      'Russian cuisine and tea culture',
      'Russian music from classical to modern',
      'the Trans-Siberian Railway and Russian nature',
    ],
    requiredSttProvider: 'soniox',
  },
};

/**
 * Get configuration for a specific language
 * @param code - Language code (e.g., 'es', 'ja', 'fr')
 * @returns Language configuration or default (Spanish) if not found
 */
export function getLanguageConfig(code: string): LanguageConfig {
  const config = SUPPORTED_LANGUAGES[code];
  if (!config) {
    logger.warn(
      { requestedCode: code, fallback: 'es' },
      'language_not_found_using_fallback'
    );
    return SUPPORTED_LANGUAGES['es'];
  }
  return config;
}

/**
 * Get all supported language codes, optionally filtered by STT provider
 */
export function getSupportedLanguageCodes(sttProvider?: STTProvider): string[] {
  return Object.values(SUPPORTED_LANGUAGES)
    .filter(
      (lang) =>
        !lang.requiredSttProvider || lang.requiredSttProvider === sttProvider
    )
    .map((lang) => lang.code);
}

/**
 * Get language options for frontend dropdown, optionally filtered by STT provider
 */
export function getLanguageOptions(sttProvider?: STTProvider): Array<{
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}> {
  return Object.values(SUPPORTED_LANGUAGES)
    .filter(
      (lang) =>
        !lang.requiredSttProvider || lang.requiredSttProvider === sttProvider
    )
    .map((lang) => ({
      code: lang.code,
      name: lang.name,
      nativeName: lang.nativeName,
      flag: lang.flag,
    }));
}

/**
 * Default language code
 */
export const DEFAULT_LANGUAGE_CODE = 'es';
