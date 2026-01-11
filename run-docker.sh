#!/bin/bash
set -e

# Load environment variables from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$VITE_TMDB_API_KEY" ]; then
  echo "Error: VITE_TMDB_API_KEY not set. Add it to .env file."
  exit 1
fi

echo "Building Docker image..."
docker build \
  --build-arg VITE_TMDB_API_KEY="$VITE_TMDB_API_KEY" \
  -t movie-matcher .

echo "Running container on http://localhost:8000"
docker run --rm -it \
  -p 8000:8000 \
  -v "$(pwd)/data:/data" \
  movie-matcher
