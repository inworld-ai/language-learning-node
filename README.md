# Inworld Language Tutor

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Powered by Inworld AI](https://img.shields.io/badge/Powered_by-Inworld_AI-orange)](https://inworld.ai/runtime)
[![Documentation](https://img.shields.io/badge/Documentation-Read_Docs-blue)](https://docs.inworld.ai/docs/node/overview)
[![Model Providers](https://img.shields.io/badge/Model_Providers-See_Models-purple)](https://docs.inworld.ai/docs/models#llm)

A conversational language learning app powered by Inworld AI Runtime. Practice speaking with an AI tutor, get real-time feedback on your responses, and build vocabulary with auto-generated flashcards.

![App](screenshot.jpg)

## Prerequisites

- Node.js (v20 or higher)
- npm
- An Inworld AI account and API key
- An [AssemblyAI](https://www.assemblyai.com/) or [Soniox](https://soniox.com/) account and API key (for speech-to-text)

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

Create a `backend/.env` file with your Inworld key and **one** of the two STT provider keys:

```bash
INWORLD_API_KEY=your_inworld_base64_key

# Pick one STT provider:
ASSEMBLY_AI_API_KEY=your_assemblyai_key
# or
SONIOX_API_KEY=your_soniox_key
```

The server auto-detects which STT provider to use based on which API key is present. If both are set, Soniox takes priority.

| Service        | Get Key From                                         | Purpose                           |
| -------------- | ---------------------------------------------------- | --------------------------------- |
| **Inworld**    | [platform.inworld.ai](https://platform.inworld.ai/)  | AI conversations (Base64 API key) |
| **AssemblyAI** | [assemblyai.com](https://www.assemblyai.com/)         | Speech-to-text (option 1)         |
| **Soniox**     | [soniox.com](https://soniox.com/)                     | Speech-to-text (option 2)         |

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
│   │   ├── __tests__/        # Backend unit tests
│   │   ├── config/           # Language, LLM & server configuration
│   │   ├── graphs/           # Inworld Runtime conversation graphs
│   │   │   ├── configs/      # Graph JSON configurations
│   │   │   └── nodes/        # Custom graph nodes
│   │   ├── helpers/          # Audio utils, connection management
│   │   ├── prompts/          # Nunjucks prompt templates
│   │   ├── services/         # Server components (WS handler, API routes)
│   │   ├── types/            # TypeScript types
│   │   ├── utils/            # Logger
│   │   └── server.ts         # Entry point
│   └── vitest.config.ts      # Backend test config
├── frontend/
│   ├── src/
│   │   ├── __tests__/        # Frontend unit tests
│   │   ├── components/       # React components
│   │   ├── config/           # Language configuration
│   │   ├── context/          # App state & auth
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # WebSocket client, audio, storage
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

1. **Frontend** captures microphone audio and streams it via WebSocket
2. **Backend** processes audio through an Inworld Runtime graph:
   - Speech-to-text with voice activity detection (AssemblyAI or Soniox)
   - LLM generates contextual responses in the target language
   - TTS converts responses back to audio
3. **Flashcards** are auto-generated from conversation vocabulary
4. **Response feedback** provides grammar and usage corrections

## Memory System

When Supabase is configured, the app stores and retrieves user memories using semantic search:

- **Automatic memory creation**: Every few conversation turns, the system extracts memorable facts
- **Semantic retrieval**: Relevant memories are retrieved using vector similarity search (pgvector)
- **Personalized responses**: The AI uses retrieved memories to personalize conversations

Memory types:

- `learning_progress`: Vocabulary struggles, grammar patterns, learning achievements
- `personal_context`: Interests, goals, preferences shared by the user

Without Supabase, the app works in anonymous mode using localStorage (no memory persistence).

## Environment Variables Reference

| Variable                    | Required           | Description                                                        |
| --------------------------- | ------------------ | ------------------------------------------------------------------ |
| `INWORLD_API_KEY`           | Yes                | Inworld AI Base64 API key                                          |
| `ASSEMBLY_AI_API_KEY`       | One of these two ↕ | AssemblyAI API key                                                 |
| `SONIOX_API_KEY`            | One of these two ↑ | Soniox API key (takes priority if both are set)                    |
| `PORT`                      | No                 | Server port (default: 3000)                                        |
| `LOG_LEVEL`                 | No                 | `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: info) |
| `NODE_ENV`                  | No                 | Set to `production` for production log format                      |
| `ASSEMBLY_AI_EAGERNESS`     | No                 | AssemblyAI turn detection: `low`, `medium`, `high` (default: high) |
| `SONIOX_EAGERNESS`          | No                 | Soniox endpoint detection: `low`, `medium`, `high` (default: high) |
| `SUPABASE_URL`              | No                 | Supabase project URL (enables memory feature)                      |
| `SUPABASE_SECRET_KEY`       | No                 | Supabase secret key (for backend memory storage)                   |

## Testing

```bash
# Run all tests (backend + frontend)
npm test --prefix backend

# Backend tests only
npm run test:backend --prefix backend

# Frontend tests only
npm test --prefix frontend

# Watch mode (backend)
npm run test:watch --prefix backend
```

Tests cover critical paths: audio conversion, language configuration, storage persistence, and flashcard deduplication.

## Troubleshooting

**Bug Reports**: [GitHub Issues](https://github.com/inworld-ai/language-learning-node/issues)

**General Questions**: For general inquiries and support, please email us at support@inworld.ai

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
