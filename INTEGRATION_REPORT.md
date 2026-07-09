# Supabase Integration Report: Inworld Language Tutor

## Overview

**Inworld Language Tutor** is an AI-powered conversational language learning application. Users practice speaking or typing in a target language with a real-time AI tutor, receive grammar feedback, and build vocabulary via auto-generated flashcards. The app is built with a Node.js/Express backend and a React (Vite) frontend.

Supabase serves as the optional cloud layer for the application, providing:

- **Authentication** — email/password sign-up and sign-in via Supabase Auth
- **Persistent storage** — conversations, messages, flashcards, and user preferences stored in a PostgreSQL database
- **Semantic memory** — long-term user memories stored with vector embeddings and retrieved via cosine similarity search using the `pgvector` extension

The application is designed to run in two modes:

| Mode | Auth | Storage | Memory |
|------|------|---------|--------|
| **Anonymous** | None | `localStorage` only | None (ephemeral) |
| **Authenticated** | Supabase Auth | `localStorage` + Supabase (dual-write) | Supabase pgvector |

---

## Introduction to the Product

### What It Does

Users select a target language and start a spoken or text conversation with an AI tutor. The tutor responds in the target language with contextually appropriate sentences. After each exchange, the app:

1. **Provides grammar and usage feedback** on what the user said
2. **Auto-generates flashcards** for vocabulary encountered during the conversation
3. **Builds a memory** of the user's learning progress and personal interests, which is surfaced in future conversations to personalise responses

### Use-Cases for Supabase Users

| Use-Case | How Supabase Enables It |
|----------|------------------------|
| **Persistent conversations across devices** | Conversations and messages are stored in Supabase Postgres and synced to `localStorage` on login |
| **User accounts & multi-user support** | Supabase Auth handles sign-up, sign-in, and session management; Row Level Security (RLS) ensures strict data isolation between users |
| **Cloud flashcard library** | Flashcards are written to Supabase on creation and merged with local cards on login; the `unique(user_id, conversation_id, target_word)` constraint prevents duplicates |
| **Personalised AI conversations** | Every few turns the backend extracts memorable facts and stores them with vector embeddings; at the start of each turn the `match_memories` RPC retrieves the most semantically relevant memories to inject into the LLM prompt |
| **Anonymous-to-authenticated migration** | When a user signs in for the first time, all `localStorage` data (conversations, messages, flashcards) is migrated to Supabase, so nothing is lost |
| **Language preference persistence** | The selected target language is stored in `user_preferences` and restored on every login |

---

## Architecture: How Supabase Fits In

```
┌───────────────────────────────────────────────────────────┐
│  Browser (React / Vite)                                   │
│                                                           │
│  AuthContext ──── @supabase/supabase-js ──► Supabase Auth │
│       │                                                   │
│  HybridStorage ── SupabaseStorage ──────► Supabase Postgres│
│  (dual-write)     conversations, messages,                │
│                   flashcards, preferences                 │
└───────────────────────────────────────────────────────────┘
                        │ WebSocket
┌───────────────────────────────────────────────────────────┐
│  Backend (Node.js / Express)                              │
│                                                           │
│  MemoryService ── @supabase/supabase-js ─► Supabase Postgres│
│  (service-key)    user_memories + pgvector embeddings     │
│                                                           │
│  Inworld Runtime graphs:                                  │
│    memory-retrieval-node  → calls match_memories() RPC    │
│    state-update-node      → stores new memories           │
└───────────────────────────────────────────────────────────┘
```

### Key Database Tables

| Table | Purpose |
|-------|---------|
| `user_preferences` | Stores the user's preferred target language |
| `conversations` | One row per conversation session, keyed by `(user_id, language_code)` |
| `conversation_messages` | Individual messages with optional grammar `feedback` field |
| `flashcards` | Vocabulary cards with `target_word`, `english`, `example`, and `mnemonic`; unique per `(user_id, conversation_id, target_word)` |
| `user_memories` | Long-term facts about the user, stored with a 1024-dimension `vector` embedding for semantic search |

Row Level Security is enabled on every table. The frontend uses the **anon key** (RLS enforced); the backend uses the **service-role key** (bypasses RLS for memory writes and reads).

---

## Setting Up the Integration

### Prerequisites

- A [Supabase](https://supabase.com) account
- Node.js v20+
- The repository cloned locally

### Step 1 — Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Note your **Project Reference** from the dashboard URL: `supabase.com/dashboard/project/<YOUR_PROJECT_REF>`

### Step 2 — Push the Database Schema

The repository ships a complete migration file (`supabase/migrations/20240108000000_initial_schema.sql`) that creates all tables, indexes, RLS policies, triggers, and the `match_memories` function.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

This single command provisions:
- `pgvector` extension for vector similarity search
- All five application tables
- IVFFlat index on `user_memories.embedding` for fast cosine-similarity queries
- RLS policies for all tables
- The `match_memories(query_embedding, match_user_id, match_threshold, match_count)` SQL function
- Auto-update trigger for `user_memories.updated_at`

### Step 3 — Configure Backend Environment Variables

Create or update `backend/.env`:

```env
# Required
INWORLD_API_KEY=your_inworld_base64_key
ASSEMBLY_AI_API_KEY=your_assemblyai_key

# Supabase (enables memory feature)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=your_service_role_key
```

Retrieve `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (service role key) from:
**Supabase Dashboard → Settings → API**

### Step 4 — Configure Frontend Environment Variables

Create `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

Retrieve `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/public key) from:
**Supabase Dashboard → Settings → API**

> **Security note:** The frontend uses the anon key — all database access is gated by RLS policies. The backend uses the service-role key exclusively for memory operations and never exposes it to the client.

### Step 5 — Run the Application

```bash
# Development (auto-reload)
npm run dev

# Production
npm run build && npm start
```

Open [http://localhost:5173](http://localhost:5173) (dev) or [http://localhost:3000](http://localhost:3000) (production).

### Environment Variables Reference

| Variable | Side | Required | Description |
|----------|------|----------|-------------|
| `INWORLD_API_KEY` | Backend | Yes | Inworld AI Base64 API key |
| `ASSEMBLY_AI_API_KEY` | Backend | Yes | AssemblyAI speech-to-text key |
| `SUPABASE_URL` | Backend | No* | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Backend | No* | Service-role key (bypasses RLS) |
| `VITE_SUPABASE_URL` | Frontend | No* | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | No* | Anon/public key |

*Required to enable auth, persistent storage, and the memory feature.

---

## The Memory System in Detail

When Supabase is configured, the backend runs a **memory generation graph** every few conversation turns:

1. The LLM analyses recent messages and extracts memorable facts (e.g. "User struggles with subjunctive mood", "User is preparing for a trip to Mexico").
2. Each fact is embedded using the `BAAI/bge-large-en-v1.5` model (1024 dimensions) via the Inworld embedder.
3. The embedding and metadata are stored in `user_memories`.

At the start of each conversation turn, a **memory retrieval node** queries Supabase:

```sql
-- Executed via the match_memories() RPC
SELECT id, content, memory_type, topics, importance,
       1 - (embedding <=> query_embedding) AS similarity
FROM user_memories
WHERE user_id = $1
  AND embedding IS NOT NULL
  AND embedding <=> query_embedding < (1 - 0.7)   -- threshold
ORDER BY embedding <=> query_embedding
LIMIT 3;
```

The retrieved memories are injected into the conversation prompt to produce personalised, context-aware responses.

Memory types:

| Type | Examples |
|------|---------|
| `learning_progress` | Vocabulary struggles, grammar patterns, achievements |
| `personal_context` | Hobbies, travel plans, goals shared by the user |

---

## Relevant Documentation

- **Supabase JavaScript Client:** https://supabase.com/docs/reference/javascript/introduction
- **Supabase Auth:** https://supabase.com/docs/guides/auth
- **Supabase pgvector / AI & Vectors:** https://supabase.com/docs/guides/ai
- **Row Level Security:** https://supabase.com/docs/guides/database/postgres/row-level-security
- **Inworld Runtime Node.js SDK:** https://docs.inworld.ai/docs/node/overview
- **Inworld Model Providers:** https://docs.inworld.ai/docs/models#llm
- **AssemblyAI (speech-to-text):** https://www.assemblyai.com/docs
- **Project README:** [README.md](./README.md)
- **GitHub Repository:** https://github.com/inworld-ai/language-learning-node
