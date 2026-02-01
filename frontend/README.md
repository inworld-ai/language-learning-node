# Language Learning Node - Frontend

React + TypeScript frontend for the Inworld Language Tutor application.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` with your Supabase credentials (optional, for auth/sync):
   ```bash
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
   ```

## Development

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
npm test         # Run tests
```

## Structure

```
src/
├── components/   # React UI components
├── context/      # App state & auth context
├── hooks/        # Custom React hooks
├── services/     # WebSocket, audio, storage services
├── styles/       # CSS styles
└── types/        # TypeScript type definitions
```
