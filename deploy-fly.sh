#!/bin/bash
set -e

# Load environment variables from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "${VITE_TMDB_API_KEY:-}" ]; then
  echo "Error: VITE_TMDB_API_KEY not set. Add it to .env or export it."
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "Error: flyctl not found. Install from https://fly.io/docs/flyctl/install/."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker not found. Install Docker to build locally."
  exit 1
fi

echo "Deploying to Fly.io (linux/amd64)..."
DOCKER_DEFAULT_PLATFORM=linux/amd64 \
  flyctl deploy \
    --config fly.toml \
    --local-only \
    --build-arg VITE_TMDB_API_KEY="$VITE_TMDB_API_KEY" \
    "$@"
