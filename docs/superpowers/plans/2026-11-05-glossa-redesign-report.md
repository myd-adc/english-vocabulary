# Glossa redesign: report

## What changed

- Renamed Dicktionary to Glossa: index.html, PWA manifest, Home/Auth/NoAccess copy, README, `app/__init__.py`, API title, MCP server name (`glossa`) and its test, `web/package.json`, test fixtures. Service URL, `render.yaml`, theme localStorage key and the old cache name are untouched.
- New tokens (`web/src/styles/tokens.css`): lapis/paper palette in light and dark, 13/16/20/25/31/39 scale, 10px and 12px radii, one shadow token used only by the menu and sheet/dialog. EB Garamond is self-hosted through `@fontsource/eb-garamond` (latin and cyrillic, 400/500/600 and italic 400), imported in `main.tsx`.
- Signature: English headword in ink Garamond, Ukrainian gloss in lapis Garamond italic beneath it, with a 0.6em indent. Used in the home result, topic rows, edit sheet preview (new `EntryPreview`), flashcard front/back (the back now shows the small headword above the gloss), quiz prompt, options and answer, and the auth title (`Glossa` with the gloss `глоса`).
- Lists sit on the paper with hairlines: topic tiles became an index (no boxes), word rows and review rows are hairline rows. The result card, flashcard, option buttons and sheets keep a white sheet surface.
- New icon: double-storey EB Garamond g, paper on lapis. `tools/make_icons.py` takes the TTF as an argument or `EB_GARAMOND_TTF`; no font binaries committed. Checked at 512, 64, 32 and 16px.
- Theme colours in `index.html` and the manifest follow the palette.
- Dev-only screenshot bypass in `web/src/lib/auth.ts`: active only when `import.meta.env.DEV` and `VITE_DEV_FAKE_SESSION=1`; the token comes from `VITE_DEV_FAKE_TOKEN`. In a production build `DEV` is false at build time; verified `VITE_DEV_FAKE` does not appear in `web/dist`.

## File map

- Tokens and fonts: `web/src/styles/tokens.css`, `web/src/main.tsx`
- Component styles: all `web/src/components/*.module.css` except Icon, Page, ErrorMsg, EditSheet, OfflineBanner, Skeleton, Switch
- Route styles: `web/src/routes/{Auth,Home,Review,Topic}.module.css`
- TSX: `QuickResult.tsx` (gloss colouring, "you typed" note moved below the gloss), `EditSheet.tsx` (preview), `Flashcard.tsx` (back headword), `Auth.tsx` (gloss prop)
- Icons: `tools/make_icons.py`, `web/public/*.png`
- Rename: README, `app/`, tests, `web/index.html`, `web/vite.config.ts`, `web/package.json`

## Screens checked

All at 390px and 1440px, light and dark unless noted: auth (sign in), no-access, connect, home with an existing-word result, home empty-ish tiles, topic list, topic search, edit sheet, rename sheet, menu, review picker, flashcard front, flashcard back, quiz question, quiz answered (wrong and right), done screen. At 390px light only: result states pending, not English, translator unavailable, error. Dark spot-checks cover home, topic, edit, review, back, quiz.

Fixed after looking:
- The "you typed X, saved Y" note sat between headword and gloss and broke the pair; moved below.
- The part-of-speech column was too wide and wrapped glosses early; narrowed to 5.25rem.
- Flashcard back was a wall of 31px italic; reduced to 25px, with the headword above it.
- Add button crowded while busy; added a min-width.
- Secondary meanings are ink-2 and the main meaning lapis (see deviations).

## Deviations

- Italic 400 only, so no bold within the gloss. The old bold for the main meaning became colour: main meaning in lapis, other meanings in ink-2 (all lapis when no main matches).
- Topic tiles became hairline rows (two columns on desktop) rather than boxed tiles, per "lists sit on the paper".
- Added `box-shadow` to the menu (a floating surface), in addition to the sheet and dialog.
- The Garamond TTF used for icons was fetched from the google/fonts repo into the scratchpad; not committed.

## Unverified

- Real Supabase sign-in, Google OAuth, password reset (not possible locally); only the screens were rendered.
- Real iOS Safari, safe-area insets, the keyboard-aware sheet, PWA install icons on a device.
- Reduced-motion behaviour was not exercised; the existing media query is unchanged.
- Quiz "listen" question and audio were not checked visually.
- The translator was a fake; real LLM output with longer glosses may wrap differently.
- Desktop edit dialog: the sticky action bar overlaps the lower fields while scrolling. This is existing behaviour, left as is.
