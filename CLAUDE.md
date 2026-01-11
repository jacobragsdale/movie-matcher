# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

### Frontend (React + Vite)
```bash
npm run dev          # Start dev server with HMR (http://localhost:5173)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint across the repo
npm run preview      # Serve production build locally
```

### Backend (FastAPI + Python)
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000  # Run API server
```

### Full Stack Docker
```bash
docker build -t movie-matcher .
docker run -p 8000:8000 -v $(pwd)/data:/data movie-matcher
```

## Architecture

Movie Matcher is a Tinder-style group movie selection PWA. Users join a room via code, swipe on movies, and see matches when enough people swipe right on the same film.

**Monolithic single-container deployment:**
- Frontend: React 19 + TypeScript SPA built with Vite, served as static files
- Backend: Python FastAPI serving the SPA and REST API
- Database: SQLite file at `/data/movie_matcher.db`
- Deploys to Fly.io via GitHub Actions

**Key data flow:**
- TMDB API calls happen client-side (no backend proxying) via `src/tmdb.ts`
- Backend only handles swipe recording and match calculation
- Frontend polls `/api/matches/{room_code}` every 4 seconds for real-time match detection

**API endpoints:**
- `POST /api/swipe` - Record a swipe (idempotent via UNIQUE constraint)
- `GET /api/matches/{room_code}` - Get movies with right-swipes >= MATCH_THRESHOLD

**Main files:**
- `src/App.tsx` - Single-file React app (~1250 lines) with Lobby, Swiper, and Match views
- `src/api.ts` - Backend API client
- `src/tmdb.ts` - TMDB API integration
- `backend/main.py` - FastAPI app with swipe/match logic and SPA serving

## Environment Variables

- `VITE_TMDB_API_KEY` - TMDB API key (required, in `.env`)
- `MATCH_THRESHOLD` - Right swipes needed for match (default: 2)
- `MOVIE_MATCHER_DB` - SQLite path (default: `/data/movie_matcher.db`)

## Coding Conventions

- TypeScript + React with `.ts`/`.tsx` files
- 2-space indent, single quotes, no semicolons
- PascalCase component names
- Co-locate styles with components (`App.tsx` + `App.css`)
- ESLint rules in `eslint.config.js`

## UI/UX Guidelines

- Mobile-first, iOS PWA optimized
- Touch-first: large hit targets, swipe gestures, one-handed layouts
- Design inspired by Tinder-style swipe interactions

## Testing

No test framework configured. If adding tests, place them in `src/` (e.g., `MovieCard.test.tsx`) and document the command in `package.json`.
