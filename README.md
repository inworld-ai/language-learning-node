# Inworld Language Tutor

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Powered by Inworld AI](https://img.shields.io/badge/Powered_by-Inworld_AI-orange)](https://inworld.ai/runtime)
[![Documentation](https://img.shields.io/badge/Documentation-Read_Docs-blue)](https://docs.inworld.ai/docs/node/overview)
[![Model Providers](https://img.shields.io/badge/Model_Providers-See_Models-purple)](https://docs.inworld.ai/docs/models#llm)

AI voice conversation app for language learning, powered by Inworld Realtime API.

![App](screenshot.jpg)

## Prerequisites

- Node.js 20+
- [Inworld API key](https://platform.inworld.ai/) (Base64 format)

## Quick Start

```bash
git clone https://github.com/inworld-ai/language-learning-node
cd language-learning-node
npm install
cp backend/.env.example backend/.env   # add your INWORLD_API_KEY
npm run dev                             # http://localhost:5173
```

## Environment Variables

Configure in `backend/.env`:

| Variable | Required | Description |
|---|---|---|
| `INWORLD_API_KEY` | Yes | Inworld Base64 API key |
| `SUPABASE_URL` | No | Supabase project URL (enables auth + memory) |
| `SUPABASE_SECRET_KEY` | No | Supabase secret key |
| `VAD_EAGERNESS` | No | Turn detection: `low`, `medium`, `high` (default: low) |
| `PORT` | No | Server port (default: 3000) |

## Architecture

Browser captures mic audio and streams it over WebSocket to the backend. The backend proxies audio to an **Inworld Realtime WebSocket** session that handles STT (AssemblyAI u3-rt-pro), LLM response generation, and TTS in a single connection. Audio streams back to the browser.

Side features use the **Inworld LLM Router** (OpenAI-compatible endpoint): flashcard generation from conversation vocabulary, grammar/usage feedback on user utterances, and translation. Flashcards can be exported to Anki (.apkg) with embedded TTS pronunciation audio via the **Inworld TTS API**.

Optional **Supabase** integration adds user auth and cross-session memory via pgvector semantic search.

## Supported Languages

English, Spanish, French, German, Italian, Portuguese

## Tech Stack

- **Frontend**: React 19 + Vite
- **Backend**: Express + WebSocket (TypeScript)
- **Voice**: Inworld Realtime API (STT + LLM + TTS)
- **Text AI**: Inworld LLM Router (OpenAI-compatible)
- **TTS**: Inworld TTS API
- **Auth/Memory**: Supabase (optional)

## License

MIT
