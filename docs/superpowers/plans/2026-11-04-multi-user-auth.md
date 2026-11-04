# Multi-user accounts

**Goal:** Replace the single shared password with personal accounts. Each person has their own dictionary (words, topics, review progress) and their own Claude (MCP) connector.

**Decisions (made with the owner):**
- Sign-in through **Supabase Auth** (the database already lives in Supabase project `zmzwuiokweedafgeacef`): **email + password** and **Google**. Email confirmation and password reset come from Supabase.
- **Invite-only:** only emails listed in the server setting `ALLOWED_EMAILS` may use the app. Anyone else who signs up gets a clear "no access" screen and every API call returns 403.
- **MCP per user:** connecting the LexiVocab connector in Claude asks the person to sign in to their own account; the words go into that person's dictionary.
- The existing words belong to the owner (`OWNER_EMAIL`).

## Backend (FastAPI, `app/`)

- **Token verification.** The frontend sends the Supabase access token as `Authorization: Bearer <jwt>`. Verify it with PyJWT against the project's JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, currently ES256; cache keys, refetch on unknown `kid`), check `aud == "authenticated"`, expiry, issuer `{SUPABASE_URL}/auth/v1`. Also accept HS256 with `SUPABASE_JWT_SECRET` when that setting is present (used by tests; legacy projects). Take `sub` (uuid) and `email` from the claims. Email must be in `ALLOWED_EMAILS` (comma-separated, case-insensitive) else 403 `{"detail": "no_access"}`.
- `require_auth` becomes a dependency returning the current user (`id`, `email`); every vocabulary/topic/stats/review endpoint is scoped to that user.
- Remove `POST /api/auth/login`, `PWA_PASSWORD`, the login throttle and our own JWT minting for the PWA. Add `GET /api/me` → `{id, email}`.
- **Schema** (idempotent in `init_db`): `words.user_id uuid` + index; replace the unique index on `lower(word)` with a unique index on `(user_id, lower(word))`. All queries in `app/vocab.py` take `user_id` and filter by it (including topic lists, backfill, stats, due, rename, quick add duplicate checks).
- **Owner claim:** when a request comes from `OWNER_EMAIL`, words with `user_id IS NULL` are assigned to that user (once, cheap `UPDATE ... WHERE user_id IS NULL`).
- **MCP OAuth (`app/oauth_provider.py`, `oauth_store.py`, `oauth_templates.py`, `mcp_tools.py`):** the authorize step no longer asks for `MCP_SECRET`. It redirects to the frontend page `/connect?request=<id>`; the user signs in with Supabase there; the page POSTs the Supabase access token to a new endpoint that checks the allowlist, stores `user_id` on the pending authorization, issues the auth code and returns the redirect URL to Claude. Auth codes, refresh tokens and issued access tokens carry `user_id`; MCP tools read the user from the access token and scope every call to it. `oauth_*` tables get a `user_id` column (idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Existing MCP clients/tokens may be invalidated (the owner reconnects once).
- Config: `SUPABASE_URL`, `ALLOWED_EMAILS`, `OWNER_EMAIL`, optional `SUPABASE_JWT_SECRET`. `MCP_SECRET` stays only as the signing secret for our own MCP access tokens (rename the README wording accordingly). Update `render.yaml` (`sync: false` for the new ones; remove `PWA_PASSWORD`), `.env.example`, README.

## Frontend (`web/`)

- `@supabase/supabase-js`. Env at build time: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public "anon"/publishable key — safe in the bundle).
- Replace the password gate with an auth screen in the same visual style: tabs or toggle **Увійти / Створити акаунт**, email + password, **Увійти через Google**, **Забули пароль?** (reset email), and a page for setting a new password after the reset link. Show Supabase errors in Ukrainian (wrong password, email not confirmed, already registered). After sign-up show "Перевірте пошту, щоб підтвердити email".
- The API client attaches the current Supabase access token (supabase-js refreshes it); on 401 sign out to the auth screen; on 403 `no_access` show a "Немає доступу" screen with the email and a "Вийти" button.
- Menu gets the signed-in email and **Вийти** signs out of Supabase.
- `/connect` page for the MCP flow described above.
- Clear TanStack Query cache on sign-out / user change.

## Tests

- Python: generate HS256 tokens with a test `SUPABASE_JWT_SECRET` in fixtures. Cover: missing/invalid/expired token → 401, non-allowlisted email → 403, two users see only their own words and can each save the same word, owner claim of `user_id IS NULL` words, MCP tools scoped per user, the connect endpoint.
- Frontend: `npm --prefix web run build` (includes `tsc --noEmit`) passes.

## Owner setup (to report back, not to automate)

List the exact manual steps for the owner: Supabase Auth settings (Site URL and redirect URLs for `https://lexivocab.onrender.com` and `http://localhost:5173`), Google provider (Google Cloud OAuth client: authorized redirect URI `https://zmzwuiokweedafgeacef.supabase.co/auth/v1/callback`), where to copy the anon key, and the Render env vars to set.
