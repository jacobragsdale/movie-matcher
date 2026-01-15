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

## Features Overview

### Room System
- **Create Room**: Generate a 4-character alphanumeric code (e.g., `ABCD`) with optional genre and streaming provider filters
- **Join Room**: Enter an existing room code or use a shareable URL with `?room=CODE` parameter
- **Share Room**: Copy invite link to clipboard for easy sharing

### Movie Discovery
- Movies fetched from TMDB's discover API, sorted by vote average (highest rated first)
- Filters by genre (Action, Comedy, Drama, Thriller, Horror, Romance, Sci-Fi, Adventure, Animation, Documentary)
- Filters by streaming provider (Netflix, Hulu, Prime Video, HBO Max, Paramount+, Disney+, Apple TV+)
- Minimum 100 votes required (`MIN_VOTE_COUNT`) to ensure quality results
- Automatic pagination with prefetch when 6 or fewer movies remain (`PREFETCH_THRESHOLD`)

### Swiping Interface
- **Swipe Right / Accept**: Records a "right" swipe to the backend
- **Swipe Left / Reject**: Advances to the next movie without recording (left swipes are not sent to backend)
- Touch/drag gestures with 110px threshold (`SWIPE_THRESHOLD`) to register a swipe
- Visual rotation effect during drag (max ±12 degrees)
- Accept/Reject buttons as alternative to swipe gestures

### Match Detection
- Frontend polls `/api/matches/{room_code}` every 4 seconds (`POLL_INTERVAL`)
- A movie becomes a "match" when `MATCH_THRESHOLD` (default: 2) users swipe right
- Match notification dialog appears immediately when new matches are detected
- Matches panel displays all matched movies with poster thumbnails

### Movie Details Panel
- Full movie details (runtime, genres, languages, production companies)
- Watch providers by region (Stream/Rent/Buy options)
- External links: YouTube trailer, IMDb page, official homepage, TMDB watch page
- Accessible from both the swipe card ("Full details" button) and match list items

### Session Persistence
- Session stored in `sessionStorage` under key `movie-matcher-session`
- Stores: `roomCode`, `userId`, `genreIds`, `providerIds`
- Auto-restores session on page reload
- Auto-join via URL parameter (`?room=CODE`) for users clicking shared links
- **Swipe progress persisted**: All swipes (left and right) are recorded to the backend. When returning to a room, previously swiped movies are filtered out so users continue where they left off
- **Matches persisted**: Matches are fetched from the backend on session restore, so users see all previous matches

## Architecture

Movie Matcher is a Tinder-style group movie selection PWA. Users join a room via code, swipe on movies, and see matches when enough people swipe right on the same film.

**Monolithic single-container deployment:**
- Frontend: React 19 + TypeScript SPA built with Vite, served as static files
- Backend: Python FastAPI serving the SPA and REST API
- Database: SQLite file at `/data/movie_matcher.db`
- Deploys to Fly.io via GitHub Actions

**Key data flow:**
- TMDB API calls happen client-side (no backend proxying) via `src/tmdb.ts`
- Backend only handles room management, swipe recording, and match calculation
- Frontend polls `/api/matches/{room_code}` every 4 seconds for real-time match detection

**Main files:**
- `src/App.tsx` - Single-file React app (~1580 lines) with Lobby, Swiper, and Match views
- `src/api.ts` - Backend API client
- `src/tmdb.ts` - TMDB API integration
- `backend/main.py` - FastAPI app with room/swipe/match logic and SPA serving

## Database Schema

### `rooms` Table
```sql
CREATE TABLE rooms (
  room_code TEXT PRIMARY KEY,           -- 4-char code like 'ABCD'
  genre_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of TMDB genre IDs
  provider_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of TMDB provider IDs
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

### `swipes` Table
```sql
CREATE TABLE swipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,              -- References room
  user_id TEXT NOT NULL,                -- Client-generated UUID prefix
  movie_id INTEGER NOT NULL,            -- TMDB movie ID
  direction TEXT NOT NULL CHECK (direction IN ('left', 'right')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_code, user_id, movie_id)  -- Ensures idempotent swipes
)
```

## API Reference

### `POST /api/rooms` - Create Room
**Request:**
```json
{
  "room_code": "ABCD",
  "genre_ids": [28, 35],
  "provider_ids": [8, 337]
}
```
**Response (201):**
```json
{
  "room_code": "ABCD",
  "genre_ids": [28, 35],
  "provider_ids": [8, 337],
  "created_at": "2024-01-15 10:30:00"
}
```
**Errors:** `409 Conflict` if room already exists

### `GET /api/rooms/{room_code}` - Get Room
**Response (200):**
```json
{
  "room_code": "ABCD",
  "genre_ids": [28, 35],
  "provider_ids": [8, 337],
  "created_at": "2024-01-15 10:30:00"
}
```
**Errors:** `404 Not Found` if room doesn't exist

### `POST /api/swipe` - Record Swipe
**Request:**
```json
{
  "room_code": "ABCD",
  "user_id": "a1b2c3d4",
  "movie_id": 550,
  "direction": "right"
}
```
**Response (200):**
```json
{ "status": "ok" }
```
**Notes:** Uses `INSERT ... ON CONFLICT DO UPDATE` for idempotency - re-swiping updates the direction. Both left and right swipes are recorded to track user progress.

### `GET /api/swipes/{room_code}/{user_id}` - Get User's Swiped Movies
**Response (200):**
```json
{
  "swiped_movie_ids": [550, 680, 155, 238]
}
```
Returns all movie IDs the user has swiped on (left or right) in this room. Used to filter out already-seen movies when returning to a room.

### `GET /api/matches/{room_code}` - Get Matches
**Response (200):**
```json
{
  "matches": [550, 680, 155]
}
```
Returns movie IDs where `COUNT(right swipes) >= MATCH_THRESHOLD`, ordered by count descending

### `GET /api/health` - Health Check
**Response (200):**
```json
{ "status": "ok" }
```

## TMDB Integration

All TMDB API calls are made client-side from `src/tmdb.ts`:

### Endpoints Used
- `GET /discover/movie` - Fetch movies with filters (genres, providers, pagination)
- `GET /movie/{id}` - Fetch detailed movie info (runtime, tagline, genres, etc.)
- `GET /movie/{id}/videos` - Fetch trailers and videos
- `GET /movie/{id}/watch/providers` - Fetch streaming availability by region

### Image URLs
- Posters: `https://image.tmdb.org/t/p/w500{poster_path}`
- Provider logos: `https://image.tmdb.org/t/p/w92{logo_path}`

### Genre IDs (TMDB)
| ID | Genre |
|----|-------|
| 28 | Action |
| 35 | Comedy |
| 18 | Drama |
| 53 | Thriller |
| 27 | Horror |
| 10749 | Romance |
| 878 | Sci-Fi |
| 12 | Adventure |
| 16 | Animation |
| 99 | Documentary |

### Provider IDs (TMDB)
| ID | Provider |
|----|----------|
| 8 | Netflix |
| 15 | Hulu |
| 9 | Prime Video |
| 384 | HBO Max |
| 531 | Paramount+ |
| 337 | Disney+ |
| 350 | Apple TV+ |

## Environment Variables

- `VITE_TMDB_API_KEY` - TMDB API key (required, in `.env`)
- `VITE_API_BASE_URL` - Backend API base URL (optional, defaults to same origin)
- `MATCH_THRESHOLD` - Right swipes needed for match (default: 2)
- `MOVIE_MATCHER_DB` - SQLite path (default: `/data/movie_matcher.db`)
- `MOVIE_MATCHER_STATIC_DIR` - Static files directory (optional)
- `CORS_ORIGINS` - Comma-separated allowed origins (default: `http://localhost:5173,http://127.0.0.1:5173`)

## Frontend Constants

```typescript
const SWIPE_THRESHOLD = 110        // Pixels to drag before swipe registers
const POLL_INTERVAL = 4000         // Match polling interval (ms)
const PREFETCH_THRESHOLD = 6       // Load more when this many movies remain
const MAX_TMDB_PAGE = 500          // TMDB API max page limit
const MIN_VOTE_COUNT = 100         // Minimum votes for movie quality filter
```

## User Flow

1. **Lobby (Initial)**: User sees "Create a Room" and "Join a Room" buttons
2. **Create Flow**:
   - Select optional genre/provider filters
   - Click "Create Room" → generates 4-char code, creates room in DB
   - Share screen shows code + "Copy invite link" button
   - Click "Start swiping" → enters session
3. **Join Flow**:
   - Enter 4-char room code (or arrive via `?room=CODE` URL)
   - Fetches room from backend to get filters
   - Enters session with room's genre/provider settings
4. **Swiping Session**:
   - Movies displayed as cards with poster, title, year, overview, rating
   - Swipe right or tap Accept → records swipe, checks for new matches
   - Swipe left or tap Reject → advances without recording
   - Matches panel updates in real-time via polling
5. **Match Notification**: Dialog appears when new matches detected
6. **Movie Details**: Tap card or match item → full details sheet with watch options

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
