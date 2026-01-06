from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterable, Literal

from fastapi import FastAPI
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


def get_connection() -> sqlite3.Connection:
  DB_PATH.parent.mkdir(parents=True, exist_ok=True)
  connection = sqlite3.connect(DB_PATH)
  connection.row_factory = sqlite3.Row
  return connection


def init_db() -> None:
  with get_connection() as connection:
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

  return {'status': 'ok'}


@app.get('/api/matches/{room_code}')
def get_matches(room_code: str) -> dict[str, list[int]]:
  with get_connection() as connection:
    rows = connection.execute(
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

  matches = [int(row['movie_id']) for row in rows]
  return {'matches': matches}


@app.get('/api/health')
def health() -> dict[str, str]:
  return {'status': 'ok'}


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
