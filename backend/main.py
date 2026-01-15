from __future__ import annotations

import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Iterable, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

MATCH_THRESHOLD = int(os.getenv('MATCH_THRESHOLD', '2'))
CORS_ORIGINS = [
  origin.strip()
  for origin in os.getenv(
    'CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
  ).split(',')
  if origin.strip()
]
STATIC_DIR = os.getenv('MOVIE_MATCHER_STATIC_DIR')


def resolve_db_path() -> Path:
  env_path = os.getenv('MOVIE_MATCHER_DB')
  candidates = (
    [Path(env_path)] if env_path else [Path('/data/movie_matcher.db')]
  )
  candidates.append(Path(__file__).resolve().parent / 'data' / 'movie_matcher.db')

  for candidate in candidates:
    try:
      candidate.parent.mkdir(parents=True, exist_ok=True)
      return candidate
    except OSError:
      continue

  return candidates[-1]


DB_PATH = resolve_db_path()


class SwipeRequest(BaseModel):
  room_code: str
  user_id: str
  movie_id: int
  direction: Literal['left', 'right']


class CreateRoomRequest(BaseModel):
  room_code: str
  genre_ids: list[int] = []
  provider_ids: list[int] = []


class RoomResponse(BaseModel):
  room_code: str
  genre_ids: list[int]
  provider_ids: list[int]
  created_at: str


class JoinRoomRequest(BaseModel):
  username: str


class JoinRoomResponse(BaseModel):
  room_code: str
  user_id: str
  username: str
  is_new_user: bool


class RoomUser(BaseModel):
  user_id: str
  username: str


class RoomUsersResponse(BaseModel):
  users: list[RoomUser]


class MatchLiker(BaseModel):
  username: str


class MatchWithLikers(BaseModel):
  movie_id: int
  liked_by: list[str]


class MatchesResponse(BaseModel):
  matches: list[MatchWithLikers]


def get_connection() -> sqlite3.Connection:
  DB_PATH.parent.mkdir(parents=True, exist_ok=True)
  connection = sqlite3.connect(DB_PATH)
  connection.row_factory = sqlite3.Row
  return connection


def init_db() -> None:
  with get_connection() as connection:
    connection.execute(
      """
      CREATE TABLE IF NOT EXISTS rooms (
        room_code TEXT PRIMARY KEY,
        genre_ids TEXT NOT NULL DEFAULT '[]',
        provider_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      """
    )
    connection.execute(
      """
      CREATE TABLE IF NOT EXISTS swipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        movie_id INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('left', 'right')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_code, user_id, movie_id)
      )
      """
    )
    connection.execute(
      """
      CREATE TABLE IF NOT EXISTS room_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_code, user_id),
        UNIQUE(room_code, username COLLATE NOCASE)
      )
      """
    )


app = FastAPI(title='Movie Matcher API')

if CORS_ORIGINS:
  app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
  )


@app.on_event('startup')
def on_startup() -> None:
  init_db()


@app.post('/api/swipe')
def record_swipe(payload: SwipeRequest) -> dict[str, str]:
  with get_connection() as connection:
    connection.execute(
      """
      INSERT INTO swipes (room_code, user_id, movie_id, direction, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(room_code, user_id, movie_id)
      DO UPDATE SET direction=excluded.direction, updated_at=CURRENT_TIMESTAMP
      """,
      (payload.room_code, payload.user_id, payload.movie_id, payload.direction),
    )
    # Update user's last_active_at
    connection.execute(
      'UPDATE room_users SET last_active_at = CURRENT_TIMESTAMP WHERE room_code = ? AND user_id = ?',
      (payload.room_code, payload.user_id),
    )

  return {'status': 'ok'}


@app.get('/api/matches/{room_code}')
def get_matches(room_code: str) -> MatchesResponse:
  with get_connection() as connection:
    # Get movies that meet the match threshold
    movie_rows = connection.execute(
      """
      SELECT movie_id, COUNT(*) as right_count
      FROM swipes
      WHERE room_code = ? AND direction = 'right'
      GROUP BY movie_id
      HAVING COUNT(*) >= ?
      ORDER BY right_count DESC, movie_id ASC
      """,
      (room_code, MATCH_THRESHOLD),
    ).fetchall()

    matches = []
    for movie_row in movie_rows:
      movie_id = int(movie_row['movie_id'])
      # Get usernames who liked this movie
      user_rows = connection.execute(
        """
        SELECT ru.username
        FROM swipes s
        JOIN room_users ru ON s.room_code = ru.room_code AND s.user_id = ru.user_id
        WHERE s.room_code = ? AND s.movie_id = ? AND s.direction = 'right'
        ORDER BY ru.username ASC
        """,
        (room_code, movie_id),
      ).fetchall()
      liked_by = [row['username'] for row in user_rows]
      matches.append(MatchWithLikers(movie_id=movie_id, liked_by=liked_by))

  return MatchesResponse(matches=matches)


@app.get('/api/health')
def health() -> dict[str, str]:
  return {'status': 'ok'}


@app.get('/api/swipes/{room_code}/{user_id}')
def get_user_swipes(room_code: str, user_id: str) -> dict[str, list[int]]:
  with get_connection() as connection:
    rows = connection.execute(
      """
      SELECT movie_id
      FROM swipes
      WHERE room_code = ? AND user_id = ?
      """,
      (room_code, user_id),
    ).fetchall()

  swiped_movie_ids = [int(row['movie_id']) for row in rows]
  return {'swiped_movie_ids': swiped_movie_ids}


@app.post('/api/rooms')
def create_room(payload: CreateRoomRequest) -> RoomResponse:
  with get_connection() as connection:
    try:
      connection.execute(
        """
        INSERT INTO rooms (room_code, genre_ids, provider_ids)
        VALUES (?, ?, ?)
        """,
        (
          payload.room_code,
          json.dumps(payload.genre_ids),
          json.dumps(payload.provider_ids),
        ),
      )
    except sqlite3.IntegrityError:
      raise HTTPException(status_code=409, detail='Room already exists')

    row = connection.execute(
      'SELECT * FROM rooms WHERE room_code = ?',
      (payload.room_code,),
    ).fetchone()

  return RoomResponse(
    room_code=row['room_code'],
    genre_ids=json.loads(row['genre_ids']),
    provider_ids=json.loads(row['provider_ids']),
    created_at=row['created_at'],
  )


@app.get('/api/rooms/{room_code}')
def get_room(room_code: str) -> RoomResponse:
  with get_connection() as connection:
    row = connection.execute(
      'SELECT * FROM rooms WHERE room_code = ?',
      (room_code,),
    ).fetchone()

  if not row:
    raise HTTPException(status_code=404, detail='Room not found')

  return RoomResponse(
    room_code=row['room_code'],
    genre_ids=json.loads(row['genre_ids']),
    provider_ids=json.loads(row['provider_ids']),
    created_at=row['created_at'],
  )


@app.post('/api/rooms/{room_code}/join')
def join_room(room_code: str, payload: JoinRoomRequest) -> JoinRoomResponse:
  username = payload.username.strip()[:10]
  if not username:
    raise HTTPException(status_code=400, detail='Username is required')

  with get_connection() as connection:
    # Check if room exists
    room = connection.execute(
      'SELECT room_code FROM rooms WHERE room_code = ?',
      (room_code,),
    ).fetchone()
    if not room:
      raise HTTPException(status_code=404, detail='Room not found')

    # Check if username already exists in this room (case-insensitive)
    existing = connection.execute(
      'SELECT user_id, username FROM room_users WHERE room_code = ? AND username = ? COLLATE NOCASE',
      (room_code, username),
    ).fetchone()

    if existing:
      # Update last_active_at and return existing user
      connection.execute(
        'UPDATE room_users SET last_active_at = CURRENT_TIMESTAMP WHERE room_code = ? AND user_id = ?',
        (room_code, existing['user_id']),
      )
      return JoinRoomResponse(
        room_code=room_code,
        user_id=existing['user_id'],
        username=existing['username'],
        is_new_user=False,
      )

    # Create new user
    user_id = str(uuid.uuid4())[:8]
    connection.execute(
      'INSERT INTO room_users (room_code, user_id, username) VALUES (?, ?, ?)',
      (room_code, user_id, username),
    )

    return JoinRoomResponse(
      room_code=room_code,
      user_id=user_id,
      username=username,
      is_new_user=True,
    )


@app.get('/api/rooms/{room_code}/users')
def get_room_users(room_code: str) -> RoomUsersResponse:
  with get_connection() as connection:
    rows = connection.execute(
      'SELECT user_id, username FROM room_users WHERE room_code = ? ORDER BY created_at ASC',
      (room_code,),
    ).fetchall()

  users = [RoomUser(user_id=row['user_id'], username=row['username']) for row in rows]
  return RoomUsersResponse(users=users)


def resolve_static_dir() -> Path | None:
  if STATIC_DIR:
    candidate = Path(STATIC_DIR)
    return candidate if candidate.exists() else None

  candidates: Iterable[Path] = [
    Path(__file__).resolve().parent / 'static',
    Path(__file__).resolve().parent.parent / 'dist',
  ]

  for candidate in candidates:
    if candidate.exists():
      return candidate

  return None


static_dir = resolve_static_dir()
static_root = static_dir.resolve() if static_dir else None


@app.get('/', include_in_schema=False)
def serve_root():
  if not static_root:
    return {'detail': 'Static directory not configured'}

  index_path = static_root / 'index.html'
  if index_path.exists():
    return FileResponse(index_path)
  return {'detail': 'index.html not found'}


@app.get('/{full_path:path}', include_in_schema=False)
def spa_fallback(full_path: str):
  if not static_root:
    return {'detail': 'Static directory not configured'}

  requested_path = (static_root / full_path).resolve()
  if not str(requested_path).startswith(str(static_root)):
    return {'detail': 'Not found'}

  if requested_path.is_file():
    return FileResponse(requested_path)

  index_path = static_root / 'index.html'
  if index_path.exists():
    return FileResponse(index_path)
  return {'detail': 'index.html not found'}
