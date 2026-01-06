# Repository Guidelines

## Product Goals & Platform Targets
- Mobile-first UI inspired by swipe-based matching (Tinder-like interactions).
- Primary target is iOS PWA (home-screen installable, full-screen friendly, touch-first).

## Project Structure & Module Organization
- `src/` holds the React + TypeScript app entry points (`main.tsx`) and UI (`App.tsx`).
- `src/assets/` contains importable assets (e.g., SVGs used in components).
- `public/` is for static files served as-is (e.g., `/vite.svg`).
- `index.html` is the Vite HTML entry template.
- Build output goes to `dist/` (ignored by ESLint).

## Build, Test, and Development Commands
- `npm run dev` starts the Vite dev server with HMR.
- `npm run build` runs TypeScript project build (`tsc -b`) then bundles with Vite.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint across the repository.

## Coding Style & Naming Conventions
- Use TypeScript + React with `.ts`/`.tsx` files in `src/`.
- Follow existing formatting: 2-space indent, single quotes, no semicolons.
- Components use PascalCase names (e.g., `App`, `MovieCard`).
- Prefer co-locating component styles in `src/` (e.g., `App.tsx` + `App.css`).
- Lint rules come from `eslint.config.js` (ESLint + TypeScript + React Hooks + React Refresh).
- Design for touch: large hit targets, swipe gestures, and one-handed layouts.

## Testing Guidelines
- No test framework is configured yet.
- If you add tests, keep them in `src/` (e.g., `MovieCard.test.tsx`) and document the new command in `package.json`.

## Commit & Pull Request Guidelines
- No commit history is available in this repository; use clear, imperative messages (e.g., `Add movie filter UI`).
- PRs should describe the change, include a brief testing note (commands run), and add screenshots for UI changes.

## Configuration Tips
- Vite supports environment variables prefixed with `VITE_` in `.env*` files; keep secrets out of the client bundle.
- For PWA support, place `manifest.webmanifest` and icons in `public/`, then link them in `index.html`.
- iOS PWA checklist: `viewport-fit=cover`, `apple-mobile-web-app-capable`, app icons (`180x180`), and `safe-area-inset-*` padding in the main layout.
