# Glossa: rename and visual redesign

**Goal:** Rename the app from Dicktionary to **Glossa** everywhere users see it, and give the whole web app a more beautiful, distinctive look. Features, routes, API calls and Ukrainian copy meaning stay the same.

## Concept

A gloss is a translation written small between the lines of a manuscript, right under the unfamiliar word. That is exactly what this app is: an English headword with its Ukrainian gloss. The one bold idea: **every word is shown as a headword with its gloss set beneath it**, in a contrasting italic lapis colour. Everything else is quiet and disciplined.

## Tokens

Colour (light):
- paper `#F4F5F7` (page), sheet `#FFFFFF` (sheets, inputs)
- ink `#17191E` (text), ink-2 `#5B606B` (secondary), rule `#DADDE3` (hairlines)
- lapis `#2E44A8` (accent: glosses, primary buttons, focus, links), lapis-soft `rgba(46,68,168,.09)`
- danger `#B3261E`

Colour (dark):
- night `#0F1115`, sheet `#171A20`, ink `#E8E9ED`, ink-2 `#9AA0AC`, rule `#2A2F38`
- lapis `#9DB0FF` (on-lapis text `#0E1430`), danger `#F08A80`

Type:
- **EB Garamond** (self-hosted with `@fontsource/eb-garamond`, latin + cyrillic subsets, weights 400/500/600 + italic 400) for English headwords, Ukrainian glosses, screen titles and numbers.
- System sans (`-apple-system, …`) for controls, inputs, buttons, small UI text.
- Scale (major third): 13 / 16 / 20 / 25 / 31 / 39 px. Headword 20–25px Garamond 500; gloss 16–17px Garamond italic in lapis, set directly beneath the headword with a tight gap (2–4px) and a small indent (~0.6em), like an interlinear gloss.
- Sentence case everywhere; no ALL-CAPS labels, no tracked-out eyebrows.

Layout:
- Keep the current structure, routes and components; left-aligned single column (max ~640px) on mobile, current desktop layout ≥ 900px refined, not replaced.
- Lists sit directly on the paper separated by hairlines — no cards-on-grey, no drop shadows except the bottom sheet / dialog.
- Radius: 12px for sheets and dialogs, 10px for inputs/buttons, pills only for topic chips.
- Generous vertical rhythm: 8px base grid.

Principles:
- The headword + gloss pair is the signature; repeat it consistently (home result card, topic word rows, edit sheet preview, flashcard front/back, quiz).
- One accent colour (lapis). Danger red only for destructive actions and errors.
- Motion only in answer to the user (sheet open, card flip, pending pulse); respect `prefers-reduced-motion`.
- Visible keyboard focus (2px lapis outline), AA contrast in both themes.

## Logo and icons

- Mark: a double-storey EB Garamond lowercase **g** in paper colour on lapis. Generate with `tools/make_icons.py` (PIL; download the EB Garamond TTF from the fontsource package in `node_modules` or Google Fonts at build time of the script — do not commit large font binaries outside `node_modules`). Outputs: `web/public/icon-512.png`, `icon-192.png`, `icon-maskable-512.png` (mark scaled to fit the 80% safe zone), `apple-touch-icon.png` (180), `favicon.png` (64). Check legibility at 16/32/64px.
- `theme_color` / `background_color` in the manifest and `<meta name="theme-color">` follow the new palette (light and dark).

## Rename

- "Dicktionary" → "Glossa" in: `web/index.html` (title, apple-mobile-web-app-title), `web/vite.config.ts` manifest (name "Glossa", short_name "Glossa", description), all screens (`Home`, `Auth`, `NoAccess`, any other), `README.md`, `app/__init__.py`, `app/api.py` title, `tools/make_icons.py` docstring, tests that assert the name, `web/package.json` name (`glossa-web`), MCP server name in `app/mcp_tools.py` (`"glossa"`, update its test).
- Do NOT change: the service URL, `render.yaml` service name, the theme localStorage key, the old cache name that `main.tsx` deletes.

## Done when

- `npm --prefix web run build` passes (includes `tsc --noEmit`).
- `TEST_DATABASE_URL=postgresql:///lexi_test .venv/bin/python -m pytest -q` passes.
- Screenshots reviewed of every screen at 390px and 1440px, light and dark: auth, no-access, home (empty, with words, pending add, each result status), topic page (with search), edit sheet, rename sheet, menu, review picker, flashcards (front/back), quiz, done screen, connect page.
