# React frontend port

**Goal:** Replace the vanilla-JS PWA in `pwa/` with a React + Vite + TypeScript PWA in `web/`, with the same look and the same features, so the owner (a React/Angular developer) can maintain the UI himself.

**Decisions (made with the owner):** React Router for screens, TanStack Query for API data, the current CSS carried over 1:1 (split into CSS Modules per component; tokens and dark theme stay global).

## Must keep (feature parity)

Read `pwa/index.html`, `pwa/app.js`, `pwa/quiz.js`, `pwa/speech.js`, `pwa/icons.js`, `pwa/style.css`, `pwa/sw.js`, `pwa/manifest.json` first. Everything they do must still work:

- Login with password (`POST /api/auth/login`), token in localStorage, 401 anywhere → back to login.
- Home: quick-add input (`POST /api/vocabulary/quick`) with the pending state (word shown immediately, pulsing "Перекладаю…"), all result statuses (created / exists / not_english / unavailable with manual translation form / error), the topic chip that opens the edit sheet focused on the topic field, Змінити / Видалити, empty-field hint, topic tiles incl. "Усі слова", skeleton tiles while loading.
- Menu "⋯": Розкласти слова без теми (backfill loop: repeat `POST /api/topics/backfill` while remaining > 0 and updated > 0), Оформлення (system → light → dark, saved in localStorage, applied before first paint via inline script in index.html), Вийти.
- Topic page: search, word rows with speak button, Повторити тему, Перейменувати (rename sheet, merge hint), FAB "+" opening the add sheet; adding with empty translation auto-translates via quick-add and applies other fields; skeleton rows while loading.
- Edit/add sheet with all fields, delete, datalist of topics; errors scroll into view; bottom sheet on mobile, centred dialog ≥ 900px.
- Review picker: choose topics (multi), mode (cards / quiz), direction, audio settings; study session with flashcards (flip, swipe, rating buttons, keyboard shortcuts), quiz, done screen. Same API calls as today.
- Desktop layout ≥ 900px exactly as in current CSS.
- Loaders: skeletons, button spinners via `aria-busy`.
- PWA: manifest (same content and icons), installable, works offline for the shell, updates show up right after a deploy (no stale assets).
- Ukrainian UI copy unchanged.

## Structure

```
web/
  index.html            # theme pre-paint script, meta tags from pwa/index.html
  vite.config.ts        # react plugin, vite-plugin-pwa, dev proxy /api -> http://localhost:8000
  src/
    main.tsx            # QueryClientProvider + RouterProvider
    api/                # client.ts (fetch wrapper, token, 401 handling), typed endpoints, types.ts mirroring app/models.py
    routes/             # Home, Topic, Review, Study, Login
    components/         # QuickAdd, ResultCard, TopicTiles, EditSheet, RenameSheet, Menu, Flashcard, Quiz, Skeleton, ...
    lib/                # speech.ts, theme.ts, plural.ts, settings.ts
    styles/             # tokens.css (vars + dark theme + base), *.module.css next to components
  public/               # icons, favicon, apple-touch-icon (copied from pwa/)
```

Routes: `/` home, `/topic/:name` (`/topic` = all words), `/review`, `/study`. Login is a gate in the root layout, not a route.

TypeScript strict. Keep components small. No UI library.

## Server and deploy

- `app/main.py`: serve `web/dist` instead of `pwa/`. Unknown non-API paths must return `index.html` (SPA fallback) so `/topic/Їжа` works on reload. Keep `Cache-Control: no-cache` for `index.html`, `sw.js`, `manifest.webmanifest`; hashed files under `/assets/` get `Cache-Control: public, max-age=31536000, immutable`.
- `render.yaml` buildCommand: `pip install -r requirements.txt && npm --prefix web ci && npm --prefix web run build`.
- `web/dist` is git-ignored.
- Update `tests/test_api.py` static tests for the new paths (they must not require Node: skip or build a tiny fixture dist if `web/dist` is missing).
- Delete `pwa/` at the end, once everything is ported.
- README: dev instructions (`npm --prefix web run dev` + uvicorn), build.

## Done when

- `npm --prefix web run build` and `npm --prefix web run typecheck` (tsc --noEmit) pass; `npm --prefix web run lint` if eslint is set up.
- `TEST_DATABASE_URL=postgresql:///lexi_test .venv/bin/python -m pytest -q` passes.
- Every item under "Must keep" checked manually in a browser against a local server (fake translator launcher exists for this; see below).
