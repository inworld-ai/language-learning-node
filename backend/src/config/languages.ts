/**
 * Language Configuration System
 *
 * Centralized configuration for all supported languages.
 *
 * Wire-format conventions:
 * - `bcp47` is the canonical form ("es-ES", "fi-FI"). Used for TTS-2 via
 *   `session.providerData.tts.language` (and the REST `/tts/v1/voice` `language` field).
 * - `code` is ISO 639-1 ("es", "fi"). Used as the map key, dropdown value,
 *   and Soniox STT hint via `transcription.language`.
 *
 * To add a new language: add a new entry to SUPPORTED_LANGUAGES.
 */

import { createLogger } from '../utils/logger.js';

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
}

export interface LanguageConfig {
  /** ISO 639-1 (e.g., 'es', 'ja', 'fr') — map key, dropdown value, Soniox STT hint. */
  code: string;
  /** BCP-47 with uppercase region (e.g., 'es-ES', 'fi-FI') — TTS-2 language hint. */
  bcp47: string;

  name: string; // English name: "Spanish"
  nativeName: string; // Native name: "Español"
  flag: string; // Emoji flag

  ttsConfig: TTSConfig;
  teacherPersona: TeacherPersona;
  exampleTopics: string[];
  /** 2–4 natural disfluency fillers in the target language, spoken inline (e.g. ja: ['えーと', 'あの']). */
  disfluencies: string[];
}

/**
 * Supported Languages Configuration
 *
 * The first 6 entries are curated personas. Among the rest, languages
 * with native voices in the Inworld TTS-2 catalog use them; the others
 * fall back to the multilingual Sarah/Jason voices.
 */
export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  // ── Curated languages ────────────────────────────────────────
  en: {
    code: 'en',
    bcp47: 'en-US',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    ttsConfig: {
      speakerId: 'Lauren',
      modelId: 'inworld-tts-2',
      speakingRate: 1,
      temperature: 1.1,
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
    disfluencies: ['um', 'uh', 'well', 'you know'],
  },

  es: {
    code: 'es',
    bcp47: 'es-MX',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇲🇽',
    ttsConfig: {
      speakerId: 'Rafael',
      modelId: 'inworld-tts-2',
      speakingRate: 1,
      temperature: 1.1,
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
    disfluencies: ['este', 'eh', 'pues', 'o sea'],
  },

  fr: {
    code: 'fr',
    bcp47: 'fr-FR',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    ttsConfig: {
      speakerId: 'Alain',
      modelId: 'inworld-tts-2',
      speakingRate: 1,
      temperature: 1.1,
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
    disfluencies: ['euh', 'ben', 'bah', 'tu vois'],
  },

  de: {
    code: 'de',
    bcp47: 'de-DE',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    ttsConfig: {
      speakerId: 'Josef',
      modelId: 'inworld-tts-2',
      speakingRate: 1,
      temperature: 0.7,
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
    disfluencies: ['ähm', 'also', 'naja', 'sozusagen'],
  },

  it: {
    code: 'it',
    bcp47: 'it-IT',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    ttsConfig: {
      speakerId: 'Orietta',
      modelId: 'inworld-tts-2',
      speakingRate: 1,
      temperature: 1.1,
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
    disfluencies: ['ehm', 'cioè', 'allora', 'insomma'],
  },

  pt: {
    code: 'pt',
    bcp47: 'pt-BR',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇧🇷',
    ttsConfig: {
      speakerId: 'Heitor',
      modelId: 'inworld-tts-2',
      speakingRate: 1,
      temperature: 0.7,
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
    disfluencies: ['é', 'tipo', 'então', 'sabe'],
  },

  // ── Soniox-supported languages (alphabetical) ────────────────────────
  // Languages with native voices in the Inworld catalog use them; the rest
  // alternate Sarah/Jason as multilingual TTS-2 fallbacks.
  af: {
    code: 'af',
    bcp47: 'af-ZA',
    name: 'Afrikaans',
    nativeName: 'Afrikaans',
    flag: '🇿🇦',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Pieter',
      age: 36,
      nationality: 'South African',
      description:
        'a South African tutor who loves teaching Afrikaans through Cape Town life, braai culture, and Karoo road trips',
    },
    exampleTopics: ['Cape Town and Table Mountain', 'braai culture and South African food', 'Afrikaans music and writers'],
    disfluencies: ['ag', 'um', 'nou ja'],
  },

  sq: {
    code: 'sq',
    bcp47: 'sq-AL',
    name: 'Albanian',
    nativeName: 'Shqip',
    flag: '🇦🇱',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Arta',
      age: 32,
      nationality: 'Albanian',
      description:
        'an Albanian tutor passionate about Tirana, the Albanian Riviera, and traditional cuisine',
    },
    exampleTopics: ['Tirana street life', 'the Albanian Riviera and Ksamil', 'traditional dishes like tavë kosi'],
    disfluencies: ['ëëë', 'pra', 'domethënë'],
  },

  ar: {
    code: 'ar',
    bcp47: 'ar-SA',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    ttsConfig: { speakerId: 'Nour', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Layla',
      age: 33,
      nationality: 'Saudi',
      description:
        'a Saudi tutor who loves teaching Arabic through Middle Eastern history, classical poetry, and modern culture',
    },
    exampleTopics: ['Arabic poetry and proverbs', 'food across the Levant and Gulf', 'travel to Petra, Cairo, and Riyadh'],
    disfluencies: ['يعني', 'هه', 'يا عني'],
  },

  az: {
    code: 'az',
    bcp47: 'az-AZ',
    name: 'Azerbaijani',
    nativeName: 'Azərbaycanca',
    flag: '🇦🇿',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Elmira',
      age: 34,
      nationality: 'Azerbaijani',
      description:
        'an Azerbaijani tutor who loves Baku, the Caspian coast, and Caucasus cuisine',
    },
    exampleTopics: ['Baku old city and modern skyline', 'plov and traditional Azerbaijani food', 'mugham music'],
    disfluencies: ['yəni', 'ee', 'belə'],
  },

  eu: {
    code: 'eu',
    bcp47: 'eu-ES',
    name: 'Basque',
    nativeName: 'Euskara',
    flag: '🏴',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Iker',
      age: 35,
      nationality: 'Basque',
      description:
        'a Basque tutor who loves teaching Euskara through San Sebastián pintxos and Bilbao culture',
    },
    exampleTopics: ['pintxo bars in Donostia', 'the Guggenheim and Bilbao', 'Basque mythology and rural life'],
    disfluencies: ['eee', 'beno', 'ba'],
  },

  be: {
    code: 'be',
    bcp47: 'be-BY',
    name: 'Belarusian',
    nativeName: 'Беларуская',
    flag: '🇧🇾',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Hanna',
      age: 31,
      nationality: 'Belarusian',
      description:
        'a Belarusian tutor passionate about Minsk, traditional folk songs, and Belarusian literature',
    },
    exampleTopics: ['Minsk and Belarusian cities', 'draniki and traditional cuisine', 'Belarusian folk music'],
    disfluencies: ['ну', 'эээ', 'значыць'],
  },

  bn: {
    code: 'bn',
    bcp47: 'bn-BD',
    name: 'Bengali',
    nativeName: 'বাংলা',
    flag: '🇧🇩',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Anika',
      age: 30,
      nationality: 'Bangladeshi',
      description:
        'a Bangladeshi tutor who loves teaching Bengali through Dhaka life, Tagore poetry, and the Sundarbans',
    },
    exampleTopics: ['Dhaka street food', 'Tagore and Bengali literature', 'Sundarbans and rural Bengal'],
    disfluencies: ['মানে', 'ইয়ে', 'আচ্ছা'],
  },

  bs: {
    code: 'bs',
    bcp47: 'bs-BA',
    name: 'Bosnian',
    nativeName: 'Bosanski',
    flag: '🇧🇦',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Edin',
      age: 37,
      nationality: 'Bosnian',
      description:
        'a Bosnian tutor passionate about Sarajevo, ćevapi, and Balkan history',
    },
    exampleTopics: ['Sarajevo old town', 'ćevapi and Bosnian cuisine', 'Mostar and the Stari Most bridge'],
    disfluencies: ['ovaj', 'ono', 'znaš'],
  },

  bg: {
    code: 'bg',
    bcp47: 'bg-BG',
    name: 'Bulgarian',
    nativeName: 'Български',
    flag: '🇧🇬',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Boyana',
      age: 33,
      nationality: 'Bulgarian',
      description:
        'a Bulgarian tutor who loves Sofia, Rila monasteries, and Black Sea summers',
    },
    exampleTopics: ['Sofia and the Vitosha mountains', 'banitsa and shopska salad', 'Bulgarian folk music and dance'],
    disfluencies: ['ами', 'значи', 'нали'],
  },

  ca: {
    code: 'ca',
    bcp47: 'ca-ES',
    name: 'Catalan',
    nativeName: 'Català',
    flag: '🏴',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Jordi',
      age: 36,
      nationality: 'Catalan',
      description:
        'a Catalan tutor who loves Barcelona, Gaudí, and Mediterranean coastal life',
    },
    exampleTopics: ['Barcelona neighborhoods', 'castellers and Catalan traditions', 'pa amb tomàquet and Catalan food'],
    disfluencies: ['eh', 'doncs', 'o sigui'],
  },

  zh: {
    code: 'zh',
    bcp47: 'zh-CN',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    ttsConfig: { speakerId: 'Mei', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Mei',
      age: 32,
      nationality: 'Chinese',
      description:
        'a Beijing tutor who loves teaching Mandarin through tea culture, classical poetry, and modern Chinese cinema',
    },
    exampleTopics: ['Beijing hutongs and street food', 'Chinese tea culture', 'classical poetry and modern films'],
    disfluencies: ['那个', '就是', '嗯'],
  },

  hr: {
    code: 'hr',
    bcp47: 'hr-HR',
    name: 'Croatian',
    nativeName: 'Hrvatski',
    flag: '🇭🇷',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Ivana',
      age: 34,
      nationality: 'Croatian',
      description:
        'a Croatian tutor passionate about Dubrovnik, Dalmatian islands, and Adriatic seafood',
    },
    exampleTopics: ['Dalmatian coast and islands', 'Plitvice Lakes', 'peka and Croatian seafood'],
    disfluencies: ['ovaj', 'znaš', 'pa'],
  },

  cs: {
    code: 'cs',
    bcp47: 'cs-CZ',
    name: 'Czech',
    nativeName: 'Čeština',
    flag: '🇨🇿',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Pavel',
      age: 38,
      nationality: 'Czech',
      description:
        'a Czech tutor who loves teaching through Prague history, Bohemian beer halls, and Czech literature',
    },
    exampleTopics: ['Prague castle and the old town', 'Czech pivo and beer culture', 'Kafka and Czech cinema'],
    disfluencies: ['no', 'jakoby', 'prostě'],
  },

  da: {
    code: 'da',
    bcp47: 'da-DK',
    name: 'Danish',
    nativeName: 'Dansk',
    flag: '🇩🇰',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Mette',
      age: 33,
      nationality: 'Danish',
      description:
        'a Danish tutor passionate about Copenhagen, hygge, and Nordic design',
    },
    exampleTopics: ['Copenhagen and Nyhavn', 'hygge and Scandinavian design', 'smørrebrød and new Nordic cuisine'],
    disfluencies: ['øh', 'altså', 'jo'],
  },

  nl: {
    code: 'nl',
    bcp47: 'nl-NL',
    name: 'Dutch',
    nativeName: 'Nederlands',
    flag: '🇳🇱',
    ttsConfig: { speakerId: 'Katrien', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Sanne',
      age: 31,
      nationality: 'Dutch',
      description:
        'a Dutch tutor who loves teaching through Amsterdam canals, cycling culture, and Dutch design',
    },
    exampleTopics: ['Amsterdam canals and museums', 'cycling and Dutch daily life', 'stroopwafels and bitterballen'],
    disfluencies: ['eh', 'nou', 'weet je'],
  },

  et: {
    code: 'et',
    bcp47: 'et-EE',
    name: 'Estonian',
    nativeName: 'Eesti',
    flag: '🇪🇪',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Kaarel',
      age: 34,
      nationality: 'Estonian',
      description:
        'an Estonian tutor passionate about Tallinn old town, e-Estonia, and Baltic forests',
    },
    exampleTopics: ['Tallinn medieval old town', 'Estonian saunas and forest culture', 'e-Estonia and digital society'],
    disfluencies: ['noh', 'eee', 'tähendab'],
  },

  tl: {
    code: 'tl',
    bcp47: 'fil-PH',
    name: 'Filipino',
    nativeName: 'Filipino',
    flag: '🇵🇭',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Liza',
      age: 30,
      nationality: 'Filipino',
      description:
        'a Filipino tutor who loves teaching Tagalog through Manila life, island hopping, and family traditions',
    },
    exampleTopics: ['Manila and Cebu', 'adobo and lechon', 'Philippine islands and beaches'],
    disfluencies: ['ano', 'kasi', 'parang'],
  },

  fi: {
    code: 'fi',
    bcp47: 'fi-FI',
    name: 'Finnish',
    nativeName: 'Suomi',
    flag: '🇫🇮',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Aino',
      age: 33,
      nationality: 'Finnish',
      description:
        'a Finnish tutor who loves teaching Finnish through Helsinki life and Nordic culture',
    },
    exampleTopics: ['sauna culture', 'Finnish design and architecture', 'life in Helsinki and Lapland'],
    disfluencies: ['öö', 'niinku', 'tota'],
  },

  gl: {
    code: 'gl',
    bcp47: 'gl-ES',
    name: 'Galician',
    nativeName: 'Galego',
    flag: '🏴',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Brais',
      age: 36,
      nationality: 'Galician',
      description:
        'a Galician tutor passionate about Santiago de Compostela, Atlantic coast, and Galician seafood',
    },
    exampleTopics: ['Camino de Santiago', 'pulpo a la gallega and seafood', 'Galician folk music'],
    disfluencies: ['eh', 'pois', 'ou sexa'],
  },

  el: {
    code: 'el',
    bcp47: 'el-GR',
    name: 'Greek',
    nativeName: 'Ελληνικά',
    flag: '🇬🇷',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Eleni',
      age: 35,
      nationality: 'Greek',
      description:
        'a Greek tutor who loves teaching through Athens history, the Aegean islands, and Greek philosophy',
    },
    exampleTopics: ['Athens and the Acropolis', 'Greek islands like Santorini and Crete', 'Greek philosophy and mythology'],
    disfluencies: ['ε', 'δηλαδή', 'ξέρεις'],
  },

  gu: {
    code: 'gu',
    bcp47: 'gu-IN',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Priya',
      age: 32,
      nationality: 'Gujarati',
      description:
        'a Gujarati tutor passionate about Ahmedabad, vegetarian cuisine, and Garba dance',
    },
    exampleTopics: ['Ahmedabad and Gujarati culture', 'dhokla, thepla and vegetarian thalis', 'Navratri and Garba'],
    disfluencies: ['એમ', 'મતલબ', 'જેમ કે'],
  },

  he: {
    code: 'he',
    bcp47: 'he-IL',
    name: 'Hebrew',
    nativeName: 'עברית',
    flag: '🇮🇱',
    ttsConfig: { speakerId: 'Yael', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Noa',
      age: 31,
      nationality: 'Israeli',
      description:
        'an Israeli tutor who loves teaching Hebrew through Tel Aviv beach life, Jerusalem history, and modern Israeli culture',
    },
    exampleTopics: ['Tel Aviv and Jaffa', 'Jerusalem and the Old City', 'shakshuka and Israeli cuisine'],
    disfluencies: ['אהה', 'יעני', 'כאילו'],
  },

  hi: {
    code: 'hi',
    bcp47: 'hi-IN',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Aarav', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Aarav',
      age: 34,
      nationality: 'Indian',
      description:
        'an Indian tutor who loves teaching Hindi through Bollywood, street food, and travel across India',
    },
    exampleTopics: ['Delhi and Mumbai life', 'Bollywood films and music', 'Indian street food and chai'],
    disfluencies: ['मतलब', 'अरे', 'यानी'],
  },

  hu: {
    code: 'hu',
    bcp47: 'hu-HU',
    name: 'Hungarian',
    nativeName: 'Magyar',
    flag: '🇭🇺',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Zsófia',
      age: 33,
      nationality: 'Hungarian',
      description:
        'a Hungarian tutor passionate about Budapest, thermal baths, and Magyar literature',
    },
    exampleTopics: ['Budapest and the Danube', 'gulyás and Hungarian cuisine', 'thermal baths and ruin pubs'],
    disfluencies: ['hát', 'izé', 'ugye'],
  },

  id: {
    code: 'id',
    bcp47: 'id-ID',
    name: 'Indonesian',
    nativeName: 'Indonesia',
    flag: '🇮🇩',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Budi',
      age: 35,
      nationality: 'Indonesian',
      description:
        'an Indonesian tutor who loves teaching through Bali, Javanese culture, and the diverse archipelago',
    },
    exampleTopics: ['Bali and Java', 'nasi goreng and Indonesian street food', 'island hopping across Indonesia'],
    disfluencies: ['anu', 'gitu', 'ya'],
  },

  ja: {
    code: 'ja',
    bcp47: 'ja-JP',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    ttsConfig: { speakerId: 'Hina', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Yuki',
      age: 32,
      nationality: 'Japanese',
      description:
        'a Japanese tutor who loves teaching through Tokyo neighborhoods, tea ceremony, and modern pop culture',
    },
    exampleTopics: ['Tokyo neighborhoods and Kyoto temples', 'sushi, ramen, and izakaya culture', 'anime, manga, and J-pop'],
    disfluencies: ['えーと', 'あの', 'そうですね'],
  },

  kn: {
    code: 'kn',
    bcp47: 'kn-IN',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Kavya',
      age: 30,
      nationality: 'Kannadiga',
      description:
        'a Karnataka tutor passionate about Bengaluru, Mysuru palaces, and South Indian cuisine',
    },
    exampleTopics: ['Bengaluru tech and café culture', 'Mysuru palace and Hampi ruins', 'masala dosa and South Indian food'],
    disfluencies: ['ಅಂದ್ರೆ', 'ಅಯ್ಯೋ', 'ಹಾ'],
  },

  kk: {
    code: 'kk',
    bcp47: 'kk-KZ',
    name: 'Kazakh',
    nativeName: 'Қазақ',
    flag: '🇰🇿',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Aigerim',
      age: 32,
      nationality: 'Kazakh',
      description:
        'a Kazakh tutor who loves teaching through Almaty, the steppes, and Central Asian traditions',
    },
    exampleTopics: ['Almaty and Astana', 'beshbarmak and steppe cuisine', 'eagle hunting and Kazakh traditions'],
    disfluencies: ['яғни', 'ееее', 'былай'],
  },

  ko: {
    code: 'ko',
    bcp47: 'ko-KR',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    ttsConfig: { speakerId: 'Hyunwoo', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Min-jun',
      age: 31,
      nationality: 'Korean',
      description:
        'a Korean tutor who loves teaching through Seoul life, K-pop, and Korean food culture',
    },
    exampleTopics: ['Seoul neighborhoods and Jeju island', 'K-pop, K-dramas, and Korean cinema', 'kimchi, bibimbap, and Korean BBQ'],
    disfluencies: ['그…', '음…', '저기'],
  },

  lv: {
    code: 'lv',
    bcp47: 'lv-LV',
    name: 'Latvian',
    nativeName: 'Latviešu',
    flag: '🇱🇻',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Liene',
      age: 33,
      nationality: 'Latvian',
      description:
        'a Latvian tutor passionate about Riga art nouveau, Baltic forests, and folk traditions',
    },
    exampleTopics: ['Riga old town and art nouveau', 'Latvian folk songs (dainas)', 'midsummer Jāņi celebrations'],
    disfluencies: ['nu', 'tātad', 'redzi'],
  },

  lt: {
    code: 'lt',
    bcp47: 'lt-LT',
    name: 'Lithuanian',
    nativeName: 'Lietuvių',
    flag: '🇱🇹',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Tomas',
      age: 35,
      nationality: 'Lithuanian',
      description:
        'a Lithuanian tutor who loves Vilnius old town, Curonian Spit dunes, and Baltic history',
    },
    exampleTopics: ['Vilnius and Trakai castle', 'cepelinai and Lithuanian cuisine', 'Curonian Spit and the Baltic coast'],
    disfluencies: ['na', 'tai', 'žinai'],
  },

  mk: {
    code: 'mk',
    bcp47: 'mk-MK',
    name: 'Macedonian',
    nativeName: 'Македонски',
    flag: '🇲🇰',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Nikola',
      age: 36,
      nationality: 'Macedonian',
      description:
        'a Macedonian tutor passionate about Skopje, Lake Ohrid, and Balkan history',
    },
    exampleTopics: ['Skopje and Lake Ohrid', 'tavče gravče and Macedonian cuisine', 'Balkan folk music'],
    disfluencies: ['па', 'значи', 'знаеш'],
  },

  ms: {
    code: 'ms',
    bcp47: 'ms-MY',
    name: 'Malay',
    nativeName: 'Melayu',
    flag: '🇲🇾',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Aisyah',
      age: 32,
      nationality: 'Malaysian',
      description:
        'a Malaysian tutor who loves teaching through KL street food, Penang heritage, and Borneo nature',
    },
    exampleTopics: ['Kuala Lumpur and Penang', 'nasi lemak and Malaysian street food', 'Borneo rainforests'],
    disfluencies: ['hmm', 'macam', 'tu'],
  },

  ml: {
    code: 'ml',
    bcp47: 'ml-IN',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Anjali',
      age: 31,
      nationality: 'Malayali',
      description:
        'a Kerala tutor passionate about backwater houseboats, Kathakali, and Keralan cuisine',
    },
    exampleTopics: ['Kerala backwaters and Kochi', 'sadya and coconut-based cooking', 'Kathakali and traditional arts'],
    disfluencies: ['അതേ', 'പിന്നെ', 'അല്ലെ'],
  },

  mr: {
    code: 'mr',
    bcp47: 'mr-IN',
    name: 'Marathi',
    nativeName: 'मराठी',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Rohan',
      age: 33,
      nationality: 'Marathi',
      description:
        'a Maharashtrian tutor who loves teaching through Mumbai life, Pune culture, and Marathi cinema',
    },
    exampleTopics: ['Mumbai and the Western Ghats', 'vada pav and Maharashtrian street food', 'Marathi theatre and cinema'],
    disfluencies: ['म्हणजे', 'अरे', 'तर'],
  },

  no: {
    code: 'no',
    bcp47: 'nb-NO',
    name: 'Norwegian',
    nativeName: 'Norsk',
    flag: '🇳🇴',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Sigrid',
      age: 32,
      nationality: 'Norwegian',
      description:
        'a Norwegian tutor passionate about Oslo, fjord hikes, and Nordic outdoor life',
    },
    exampleTopics: ['Oslo and the Norwegian fjords', 'friluftsliv and outdoor culture', 'brunost and Norwegian cuisine'],
    disfluencies: ['eh', 'liksom', 'altså'],
  },

  fa: {
    code: 'fa',
    bcp47: 'fa-IR',
    name: 'Persian',
    nativeName: 'فارسی',
    flag: '🇮🇷',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Darius',
      age: 36,
      nationality: 'Iranian',
      description:
        'an Iranian tutor who loves teaching Persian through Tehran life, classical poetry, and Iranian cuisine',
    },
    exampleTopics: ['Tehran and Isfahan', 'Hafez, Rumi and Persian poetry', 'kebabs, stews, and Persian rice dishes'],
    disfluencies: ['یعنی', 'خب', 'چیز'],
  },

  pl: {
    code: 'pl',
    bcp47: 'pl-PL',
    name: 'Polish',
    nativeName: 'Polski',
    flag: '🇵🇱',
    ttsConfig: { speakerId: 'Szymon', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Szymon',
      age: 33,
      nationality: 'Polish',
      description:
        'a Polish tutor passionate about Kraków old town, Polish cinema, and pierogi traditions',
    },
    exampleTopics: ['Kraków and Warsaw', 'pierogi and Polish home cooking', 'Polish cinema and history'],
    disfluencies: ['no', 'yyy', 'wiesz'],
  },

  pa: {
    code: 'pa',
    bcp47: 'pa-IN',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Harpreet',
      age: 34,
      nationality: 'Punjabi',
      description:
        'a Punjabi tutor who loves teaching through Amritsar, bhangra, and Punjabi food culture',
    },
    exampleTopics: ['Amritsar and the Golden Temple', 'butter chicken, sarson da saag, and Punjabi food', 'bhangra and Punjabi music'],
    disfluencies: ['ਮਤਲਬ', 'ਯਾਨੀ', 'ਉਹ'],
  },

  ro: {
    code: 'ro',
    bcp47: 'ro-RO',
    name: 'Romanian',
    nativeName: 'Română',
    flag: '🇷🇴',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Andrei',
      age: 35,
      nationality: 'Romanian',
      description:
        'a Romanian tutor passionate about Bucharest, Transylvanian castles, and Carpathian villages',
    },
    exampleTopics: ['Bucharest and Transylvania', 'sarmale and Romanian home cooking', 'Carpathian mountains and folklore'],
    disfluencies: ['adică', 'păi', 'deci'],
  },

  ru: {
    code: 'ru',
    bcp47: 'ru-RU',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    ttsConfig: { speakerId: 'Elena', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Anastasia',
      age: 34,
      nationality: 'Russian',
      description:
        'a Russian tutor who loves teaching through Moscow life, classical literature, and Russian cuisine',
    },
    exampleTopics: ['Moscow and St. Petersburg', 'Tolstoy, Dostoevsky and Russian literature', 'borscht, pelmeni and Russian food'],
    disfluencies: ['ну', 'это', 'как бы'],
  },

  sr: {
    code: 'sr',
    bcp47: 'sr-RS',
    name: 'Serbian',
    nativeName: 'Српски',
    flag: '🇷🇸',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Miloš',
      age: 36,
      nationality: 'Serbian',
      description:
        'a Serbian tutor passionate about Belgrade nightlife, Balkan music, and Serbian traditions',
    },
    exampleTopics: ['Belgrade nightlife and Novi Sad', 'ćevapi, ajvar and Serbian food', 'Exit Festival and Balkan music'],
    disfluencies: ['ovaj', 'znaš', 'pa'],
  },

  sk: {
    code: 'sk',
    bcp47: 'sk-SK',
    name: 'Slovak',
    nativeName: 'Slovenčina',
    flag: '🇸🇰',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Zuzana',
      age: 32,
      nationality: 'Slovak',
      description:
        'a Slovak tutor who loves Bratislava, the Tatra mountains, and Slovak folk traditions',
    },
    exampleTopics: ['Bratislava and the High Tatras', 'bryndzové halušky and Slovak cuisine', 'wooden churches and folk music'],
    disfluencies: ['no', 'akože', 'proste'],
  },

  sl: {
    code: 'sl',
    bcp47: 'sl-SI',
    name: 'Slovenian',
    nativeName: 'Slovenščina',
    flag: '🇸🇮',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Maja',
      age: 31,
      nationality: 'Slovenian',
      description:
        'a Slovenian tutor passionate about Ljubljana, Lake Bled, and Julian Alps hiking',
    },
    exampleTopics: ['Ljubljana and Lake Bled', 'potica and Slovenian cuisine', 'Julian Alps and Postojna caves'],
    disfluencies: ['no', 'pač', 'a veš'],
  },

  sw: {
    code: 'sw',
    bcp47: 'sw-KE',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    flag: '🇰🇪',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Amani',
      age: 33,
      nationality: 'Kenyan',
      description:
        'a Kenyan tutor who loves teaching Swahili through Nairobi life, coastal Lamu, and East African culture',
    },
    exampleTopics: ['Nairobi and the Maasai Mara', 'ugali, nyama choma and East African food', 'Swahili coastal culture and Lamu'],
    disfluencies: ['eee', 'yaani', 'basi'],
  },

  sv: {
    code: 'sv',
    bcp47: 'sv-SE',
    name: 'Swedish',
    nativeName: 'Svenska',
    flag: '🇸🇪',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Erik',
      age: 35,
      nationality: 'Swedish',
      description:
        'a Swedish tutor passionate about Stockholm, fika culture, and the Swedish countryside',
    },
    exampleTopics: ['Stockholm archipelago', 'fika and Swedish coffee culture', 'midsummer and Swedish traditions'],
    disfluencies: ['öh', 'liksom', 'alltså'],
  },

  ta: {
    code: 'ta',
    bcp47: 'ta-IN',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Karthik',
      age: 34,
      nationality: 'Tamil',
      description:
        'a Tamil tutor who loves teaching through Chennai life, Tamil cinema, and South Indian temples',
    },
    exampleTopics: ['Chennai and Madurai temples', 'idli, dosa and Tamil cuisine', 'Tamil cinema and Carnatic music'],
    disfluencies: ['அதான்', 'அப்பா', 'என்ன'],
  },

  te: {
    code: 'te',
    bcp47: 'te-IN',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    flag: '🇮🇳',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Lakshmi',
      age: 32,
      nationality: 'Telugu',
      description:
        'a Telugu tutor passionate about Hyderabad, biryani, and Tollywood cinema',
    },
    exampleTopics: ['Hyderabad and the Charminar', 'Hyderabadi biryani and Andhra cuisine', 'Tollywood films and Telugu poetry'],
    disfluencies: ['అంటే', 'అదే', 'అరె'],
  },

  th: {
    code: 'th',
    bcp47: 'th-TH',
    name: 'Thai',
    nativeName: 'ไทย',
    flag: '🇹🇭',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Siriporn',
      age: 31,
      nationality: 'Thai',
      description:
        'a Thai tutor who loves teaching through Bangkok markets, island life, and Thai food culture',
    },
    exampleTopics: ['Bangkok and Chiang Mai', 'pad thai, tom yum and Thai street food', 'Thai islands and beaches'],
    disfluencies: ['เอ่อ', 'แบบ', 'คือ'],
  },

  tr: {
    code: 'tr',
    bcp47: 'tr-TR',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Emre',
      age: 35,
      nationality: 'Turkish',
      description:
        'a Turkish tutor passionate about Istanbul, Anatolian history, and Turkish cuisine',
    },
    exampleTopics: ['Istanbul and the Bosphorus', 'kebabs, mezes and Turkish breakfasts', 'Cappadocia and Turkish coast'],
    disfluencies: ['şey', 'yani', 'işte'],
  },

  uk: {
    code: 'uk',
    bcp47: 'uk-UA',
    name: 'Ukrainian',
    nativeName: 'Українська',
    flag: '🇺🇦',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Olena',
      age: 33,
      nationality: 'Ukrainian',
      description:
        'a Ukrainian tutor who loves teaching through Kyiv, Lviv coffee houses, and Ukrainian folk traditions',
    },
    exampleTopics: ['Kyiv and Lviv', 'borscht, varenyky and Ukrainian cuisine', 'Ukrainian folk songs and embroidery'],
    disfluencies: ['ну', 'це', 'тобто'],
  },

  ur: {
    code: 'ur',
    bcp47: 'ur-PK',
    name: 'Urdu',
    nativeName: 'اردو',
    flag: '🇵🇰',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Zara',
      age: 32,
      nationality: 'Pakistani',
      description:
        'a Pakistani tutor passionate about Lahore, Urdu poetry (ghazals), and Mughlai cuisine',
    },
    exampleTopics: ['Lahore and Karachi', 'Urdu ghazals and shayari', 'biryani, nihari and Mughlai food'],
    disfluencies: ['یعنی', 'مطلب', 'وہ'],
  },

  vi: {
    code: 'vi',
    bcp47: 'vi-VN',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳',
    ttsConfig: { speakerId: 'Sarah', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Linh',
      age: 30,
      nationality: 'Vietnamese',
      description:
        'a Vietnamese tutor who loves teaching through Hanoi street food, Hạ Long Bay, and Vietnamese coffee culture',
    },
    exampleTopics: ['Hanoi and Ho Chi Minh City', 'phở, bánh mì and Vietnamese street food', 'Hạ Long Bay and the Mekong Delta'],
    disfluencies: ['ờ', 'thì', 'cái'],
  },

  cy: {
    code: 'cy',
    bcp47: 'cy-GB',
    name: 'Welsh',
    nativeName: 'Cymraeg',
    flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    ttsConfig: { speakerId: 'Jason', modelId: 'inworld-tts-2', speakingRate: 1, temperature: 1 },
    teacherPersona: {
      name: 'Rhys',
      age: 36,
      nationality: 'Welsh',
      description:
        'a Welsh tutor passionate about Cardiff, Snowdonia hiking, and Welsh poetry traditions',
    },
    exampleTopics: ['Cardiff and the Welsh valleys', 'Snowdonia and the coastal path', 'cawl, Welsh cakes and male voice choirs'],
    disfluencies: ['ym', 'wel', "ti'n gwybod"],
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
 * Get all supported language codes
 */
export function getSupportedLanguageCodes(): string[] {
  return Object.keys(SUPPORTED_LANGUAGES);
}

/**
 * Get language options for frontend dropdown
 */
export function getLanguageOptions(): Array<{
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}> {
  return Object.values(SUPPORTED_LANGUAGES).map((lang) => ({
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
