# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_TMDB_API_KEY
ENV VITE_TMDB_API_KEY=$VITE_TMDB_API_KEY
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.11-slim AS runner
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MOVIE_MATCHER_DB=/data/movie_matcher.db
ENV MOVIE_MATCHER_STATIC_DIR=/app/dist

RUN adduser --disabled-password --gecos '' appuser

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY --from=builder /app/dist /app/dist

RUN mkdir -p /data && chown -R appuser:appuser /data /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
