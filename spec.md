Technical Design Specification: Movie Matcher PWA
1. Project Overview
Goal: Build a lightweight, self-hosted web application that allows a group of users to find a movie to watch together. Core Concept: Users join a shared "Room" via a simple code. They are presented with a stack of movie posters (sourced from an external API). Users swipe "Left" (dislike) or "Right" (like). When a movie receives a "Right" swipe from everyone in the room (or a set threshold), the group is notified of a match.

Key Constraints:

Zero External Dependencies: No external databases (Firebase/AWS).

Portability: The entire application must run inside a single Docker container.

Simplicity: Prioritize ease of implementation over complex UI/UX features.

2. System Architecture
We are utilizing a Monolithic Single-Container Architecture. This minimizes the "DevOps" overhead and allows the application to be deployed on any server (or even a Raspberry Pi) just by running one container.

High-Level Data Flow:
The Client (Browser): A React Single Page Application (SPA). It handles the heavy lifting of fetching movie metadata and images directly from the third-party provider (TMDB).

The Server (Python): A lightweight FastAPI service. It acts as both the Web Server (serving the React files) and the API Server (handling swipe logic).

The Database (SQLite): A file-based database that lives on the server's disk.

3. Frontend Specifications
Framework: React (using Vite for the build tool). Platform: Progressive Web App (PWA) — Optimized for Mobile Safari (iPhone).

Core Components & Logic
The "Lobby" View:

Input: A text field for the "Room Code" and a hidden/random ID generator for the "User ID".

Logic: When the user joins, store the Room Code and User ID in the session state.

The "Swiper" View:

Data Source: The frontend must fetch movie data directly from The Movie Database (TMDB) API (Client-side fetching). Do not proxy this traffic through our backend; it adds unnecessary load.

Component: Use a standard Tinder-style card library.

Action:

Swipe Left: No server action required (or optional logging).

Swipe Right: Send an API request to the backend with the Room Code, User ID, and Movie ID.

The "Match Notification" System (Polling):

Since we are not using WebSockets, the frontend must implement Short Polling.

Every 3-5 seconds, the client should request the list of "Matches" for the current room from the backend.

If the list grows, trigger a browser alert or modal.

4. Backend Specifications
Framework: Python (FastAPI). Database: SQLite (via SQLAlchemy or raw SQL).

Responsibilities
Serve Static Files: The backend must be configured to serve the compiled React application (HTML/JS/CSS) from the root URL.

API Endpoints:

POST /swipe: Receives a swipe action. This endpoint must be idempotent (if a user swipes right on the same movie twice, it should not break or count double).

GET /matches/{room_code}: Returns a list of Movie IDs that have met the matching criteria.

Database Schema Design
We require a normalized schema to track activity.

Table: Swipes

id: Primary Key.

room_code: String (group identifier).

user_id: String (unique user identifier).

movie_id: Integer (external ID from TMDB).

direction: Enum ('left', 'right').

Constraint: A unique composite key on (room_code, user_id, movie_id) to prevent duplicate entries.

The "Matching Algorithm"
The matching logic should happen inside the database query for efficiency.

Query Logic: Select all movie_ids in a specific room_code where the direction is 'right'. Group the results by movie_id. Filter the groups where the count is greater than or equal to the "Match Threshold" (e.g., 2 users).

5. Deployment & Packaging (Docker)
This is the most critical part for ensuring portability. We will use a Multi-Stage Docker Build.

Stage 1: The Builder (Node.js)

Copy the frontend source code.

Run the build command to compile the React code into static HTML/JS/CSS bundles.

Stage 2: The Runner (Python)

Start with a clean, slim Python image.

Install the backend dependencies.

Copy the compiled static files from Stage 1 into the Python backend directory.

Copy the Python backend code.

Expose the application port.

Data Persistence:

The SQLite database file must be stored in a specific directory within the container.

The container must be run with a Docker Volume mapped to this directory so that the database survives if the container is restarted or updated.

6. Implementation Workflow for the Junior Engineer
Frontend First: Build the React UI. Hardcode the API responses initially to ensure the swipe animation and TMDB fetching work.

Backend Second: Set up the Python API. Create the SQLite database and the two endpoints (/swipe and /matches). Use a tool like Postman to verify the logic.

Integration: Connect the React frontend to the Python backend. Ensure the Polling logic correctly picks up changes made by Postman.

Containerization: Write the Dockerfile merging the two. Test the build locally.

Clean Up: Ensure the mobile view looks correct (meta tags for iPhone PWA status) and remove any debug logs.

7. Remaining Work Checklist (Small, Concrete Steps)
Frontend (React)
- [x] Add a Lobby view with room code input and a generated user id; persist both in sessionStorage.
- [x] Split the UI into Lobby + Swiper views and switch based on room/user state.
- [x] Add a `tmdb.ts` fetch helper and wire `VITE_TMDB_API_KEY` into the client.
- [x] Replace the placeholder card deck with real TMDB movies (poster, title, year).
- [x] On right swipe, `POST /api/swipe` with room_code, user_id, movie_id, direction.
- [x] Implement polling every 3-5 seconds to `GET /api/matches/{room_code}` and display a match modal/banner.

Backend (FastAPI + SQLite)
- [ ] Create a `backend/` folder with `requirements.txt` (fastapi, uvicorn).
- [ ] Add `backend/main.py` with a FastAPI app and CORS for local dev.
- [ ] Add a SQLite helper to create the `swipes` table with a unique (room_code, user_id, movie_id) constraint.
- [ ] Implement `POST /api/swipe` with an idempotent upsert (ignore or update on conflict).
- [ ] Implement `GET /api/matches/{room_code}` with a SQL GROUP BY + COUNT >= MATCH_THRESHOLD.
- [ ] Serve the built frontend from `/` using StaticFiles and a catch-all route to `index.html`.

Integration & PWA
- [ ] Add a Vite dev proxy for `/api` to the FastAPI server.
- [ ] Add `public/manifest.webmanifest` and app icons (192, 512, Apple 180).
- [ ] Update `index.html` with `viewport-fit=cover` and iOS PWA meta tags.
- [ ] Add `.env.example` documenting `VITE_TMDB_API_KEY` and backend envs.

Docker & Deployment
- [ ] Add a multi-stage `Dockerfile` (Node build -> Python runner).
- [ ] Store the SQLite file at `/data/movie_matcher.db` and document the volume mount.
- [ ] Verify `npm run build` + container run locally, then use `npm run preview` only for frontend-only checks.
