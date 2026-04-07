# Inworld Language Tutor

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Powered by Inworld AI](https://img.shields.io/badge/Powered_by-Inworld_AI-orange)](https://inworld.ai/runtime)
[![Documentation](https://img.shields.io/badge/Documentation-Read_Docs-blue)](https://docs.inworld.ai/docs/node/overview)
[![Model Providers](https://img.shields.io/badge/Model_Providers-See_Models-purple)](https://docs.inworld.ai/docs/models#llm)

A conversational language learning app powered by Inworld AI's Realtime API. Practice speaking with an AI tutor, get real-time feedback on your responses, and build vocabulary with auto-generated flashcards.

![App](screenshot.jpg)

## Prerequisites

- Node.js (v20 or higher)
- npm
- An [Inworld AI](https://platform.inworld.ai/) account and API key

## Get Started

### Step 1: Clone the Repository

```bash
git clone https://github.com/inworld-ai/language-learning-node
cd language-learning-node
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs dependencies for the root, backend, and frontend automatically.

### Step 3: Configure Environment Variables

Create a `backend/.env` file:

```bash
INWORLD_API_KEY=your_inworld_base64_key
```

| Service     | Get Key From                                          | Purpose                    |
| ----------- | ----------------------------------------------------- | -------------------------- |
| **Inworld** | [platform.inworld.ai](https://platform.inworld.ai/)  | Realtime voice AI (Base64) |

### Step 4: Run the Application

**For development** (with auto-reload on file changes):

```bash
npm run dev
```

This starts both the backend (port 3000) and frontend dev server (port 5173) concurrently.

Open [http://localhost:5173](http://localhost:5173)

**For production**:

```bash
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000)

### Step 5 (Optional): Set Up Supabase for Auth & Memory

Without Supabase, the app works in anonymous mode using localStorage.

**a) Create a Supabase project** at [supabase.com](https://supabase.com)

**b) Push the database schema:**

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

This creates all tables, indexes, RLS policies, and the `match_memories` function for semantic search.

Find your project ref in the Supabase dashboard URL: `supabase.com/dashboard/project/YOUR_PROJECT_REF`

**c) Add Supabase variables to `backend/.env`:**

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=your_secret_key
```

**d) Create `frontend/.env.local`:**

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

Find these in: Supabase Dashboard > Settings > API

## Repo Structure

```
language-learning-node/
├── backend/
│   ├── src/
│   │   ├── __tests__/        # Backend unit tests (60 tests)
│   │   ├── config/           # Language, server & Supabase configuration
│   │   ├── helpers/          # Anki exporter, TTS audio generator
│   │   ├── services/         # Session manager, WS handler, LLM, memory
│   │   ├── types/            # TypeScript types
│   │   ├── utils/            # Logger
│   │   └── server.ts         # Entry point
│   └── vitest.config.ts      # Backend test config
├── frontend/
│   ├── src/
│   │   ├── components/       # React components (Chat, Flashcard, Sidebar, etc.)
│   │   ├── context/          # App state & auth (AppContext, AuthContext)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # WebSocket client, audio player/handler, storage
│   │   ├── styles/           # CSS
│   │   └── types/            # TypeScript types
│   └── vitest.config.ts      # Frontend test config
├── supabase/
│   └── migrations/           # Database schema
├── render.yaml               # Render deployment config
└── package.json              # Monorepo scripts
```

## Architecture

The app uses a real-time audio streaming architecture:

1. **Frontend** captures microphone audio (24kHz PCM16) and streams it via WebSocket
2. **Backend** proxies audio to an **Inworld Realtime WebSocket** session that handles:
   - Speech-to-text (AssemblyAI u3-rt-pro via Inworld) with language hints
   - LLM response generation (GPT-4.1-nano via Inworld LLM Router)
   - Text-to-speech with language-specific voices
3. **Flashcards** are auto-generated from conversation vocabulary via the Inworld LLM Router
4. **Response feedback** provides grammar and usage corrections
5. **Anki export** generates `.apkg` files with embedded TTS pronunciation audio

## Memory System

When Supabase is configured, the app stores and retrieves user memories:

- **Automatic memory creation**: Every few conversation turns, the system extracts memorable facts via LLM
- **5-turn sliding window**: Recent conversation context is injected into session instructions (non-blocking)
- **Semantic retrieval**: Relevant memories retrieved using vector similarity search (pgvector)
- **Personalized responses**: The AI uses retrieved memories to personalize conversations

Memory types:

- `learning_progress`: Vocabulary struggles, grammar patterns, learning achievements
- `personal_context`: Interests, goals, preferences shared by the user

Without Supabase, the app works in anonymous mode using localStorage (no memory persistence).

## Supported Languages

English, Spanish, French, German, Italian, Portuguese — each with a dedicated teacher persona and voice.

## Environment Variables Reference

| Variable              | Required | Description                                                        |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `INWORLD_API_KEY`     | Yes      | Inworld AI Base64 API key                                          |
| `PORT`                | No       | Server port (default: 3000)                                        |
| `LOG_LEVEL`           | No       | `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: info) |
| `VAD_EAGERNESS`       | No       | Turn detection: `low`, `medium`, `high` (default: low)             |
| `SUPABASE_URL`        | No       | Supabase project URL (enables memory feature)                      |
| `SUPABASE_SECRET_KEY` | No       | Supabase secret key (for backend memory storage)                   |

## Testing

```bash
# Run all backend tests
cd backend && npx vitest run

# Watch mode
cd backend && npx vitest

# Type check
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

Tests cover: session management, LLM integration, turn memory, language configuration, WebSocket handler wiring, and STT event handling.

## Troubleshooting

**Bug Reports**: [GitHub Issues](https://github.com/inworld-ai/language-learning-node/issues)

**General Questions**: For general inquiries and support, please email us at support@inworld.ai

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
