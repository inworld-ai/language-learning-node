# CLAUDE.md

## Project overview
Language learning app using Inworld Realtime API for voice conversations.

## Quick reference
- **Backend**: `cd backend && npm run dev` (Express + WS on port 3000)
- **Frontend**: `cd frontend && npm run dev` (Vite on port 5173)
- **Both**: `npm run dev` (from root, uses concurrently)
- **Tests**: `cd backend && npm test` (vitest)
- **Type check**: `cd backend && npx tsc --noEmit` / `cd frontend && npx tsc --noEmit`

## Key directories
- `backend/src/services/` — session-manager (Inworld WS proxy), websocket-handler, inworld-llm, turn-memory, memory-service
- `backend/src/helpers/` — anki-exporter, tts-audio-generator
- `backend/src/config/` — languages (voices, personas), server config
- `frontend/src/components/` — ChatSection, Flashcard, FlashcardsSection, Header, Sidebar, WelcomeModal, AppModal
- `frontend/src/context/` — AppContext (main state), AuthContext (Supabase auth)
- `frontend/src/services/` — AudioPlayer, AudioHandler, WebSocketClient

## Architecture
Browser <-> our WebSocket <-> SessionManager <-> Inworld Realtime WebSocket (STT+LLM+TTS)
- SessionManager: one per client, manages Inworld WS lifecycle, forwards audio/text, handles greeting, tracks turns
- InworldLLM: uses Inworld LLM Router (OpenAI-compatible) for flashcards, feedback, translation
- TurnMemory: 5-turn sliding window, non-blocking Supabase persistence

## Environment
- Requires: `INWORLD_API_KEY` in `backend/.env`
- Optional: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` for auth + memory

## Testing
- 59 tests across 5 files (vitest)
- Run: `cd backend && npx vitest run`
- Test files: `backend/src/__tests__/`

## Conventions
- TypeScript strict mode
- ESM modules (`"type": "module"`)
- Pino for logging
- No `@inworld/runtime` or `@inworld/agents` SDK — uses raw WebSocket protocol
