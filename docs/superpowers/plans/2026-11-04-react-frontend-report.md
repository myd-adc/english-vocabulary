# React frontend port: report

Branch `feat/react-frontend`. The vanilla PWA in `pwa/` is replaced by React 19 + Vite + TypeScript (strict) in `web/`.

## Commands

```bash
npm --prefix web ci                 # install
uvicorn app.main:app --env-file .env --reload   # API on :8000
npm --prefix web run dev            # http://localhost:5173, /api proxied to :8000
npm --prefix web run typecheck      # tsc --noEmit
npm --prefix web run build          # typecheck + vite build -> web/dist (served by FastAPI at /)
TEST_DATABASE_URL=postgresql:///lexi_test .venv/bin/python -m pytest -q
```

No eslint is set up (not requested; no extra dependencies).

## File map

```
web/index.html            theme pre-paint script, meta tags
web/vite.config.ts        react, vite-plugin-pwa (autoUpdate, manifest, nav fallback deny-list), /api proxy
web/src/main.tsx          QueryClientProvider + RouterProvider
web/src/router.tsx        / , /topic/:name? , /review , /study
web/src/api/              client.ts (fetch, token store, 401), endpoints.ts, hooks.ts (queries), types.ts
web/src/lib/              speech, theme, settings (direction/activity), quiz engine, plural, words helpers
web/src/routes/           RootLayout (login gate), Login, Home, Topic, Review, Study (+ .module.css)
web/src/components/       Button, Header, Page, Sheet, EditSheet, RenameSheet, QuickAdd/QuickResult,
                          TopicTiles, Menu, WordRow, Flashcard, Quiz, Segmented, Switch, Skeleton, ...
web/src/styles/tokens.css tokens, dark theme, base (same values as pwa/style.css)
app/main.py               SPAStaticFiles: web/dist, SPA fallback, cache headers
render.yaml               build: pip install + npm ci + npm run build
tests/test_api.py         static tests on a temp fake dist; real-dist test skipped when web/dist is missing
```

## Parity and verification

Checked in a real browser (Playwright) against the fake-translator backend. Mobile 390px (dark) and desktop 1440px (light/dark).

| Must keep | How verified |
|---|---|
| Login, token, 401 -> login | wrong password message, login, forced bad token -> login screen, relogin -> home |
| Quick add + statuses | created, exists (hire, deadline, however); pending/not_english/unavailable/error code paths ported 1:1 but only created/exists exercised by hand |
| Topic chip -> edit sheet focused on topic; Змінити/Видалити | chip opened sheet with topic selected; saved, tile counts updated |
| Menu: backfill, theme cycle, logout | backfill note "Розкладено 2 слова"; theme cycled and stored; 401 path checked |
| Topic page: search, rows, FAB add, rename + merge hint | search filtered, FAB add showed "already exists" error scrolled into view, merge hint shown |
| Review picker, cards, quiz, done screens | all topics, flip, rating advance, 10/10 done; quiz answer states, finish summary |
| Desktop grid, centred dialog | 1440px screenshots |
| Skeletons, aria-busy spinners | implemented via Skeleton / Button busy; seen briefly |
| PWA | manifest served as application/manifest+json, service worker active, old `lexivocab-v6` cache replaced; deep link reload `/topic/Загальне` works |

Not hand-checked: swipe gestures (touch), speech output, iOS standalone install, offline mode, `unavailable` manual-translation form, light-theme study screens.

## Differences from the old PWA

- Quiz answers can be picked with keys 1-4 (the numbers were shown but did nothing before).
- Review and study state is in the URL (`/review?section=..`, `/study?section=..`) so a reload keeps it; exercise and direction still come from localStorage.
- Closed sheets are `inert` (not focusable); Escape also closes the header menu.
- Double rating of a card while the request is in flight is ignored.
- Dropped the old `isDifficult` helper (unused). Quick-add text and result survive navigating to other screens (as before) but are reset on logout/401.
- The old `lexivocab-v6` cache is deleted on first load.

## Server

- `/assets/*` (hashed): `public, max-age=31536000, immutable`; everything else `no-cache`.
- Unknown paths with `Accept: text/html` return `index.html`; missing assets and non-page requests stay 404; `/api`, `/mcp`, `/.well-known` are mounted earlier and unaffected.
- Missing `web/dist` does not break startup (`check_dir=False`).
