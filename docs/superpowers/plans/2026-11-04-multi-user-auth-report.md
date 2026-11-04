# Multi-user accounts: report

Branch `feat/multi-user-auth`. Implements `2026-11-04-multi-user-auth.md`.

## What was built

- Sign-in through Supabase Auth (email + password, Google). The FastAPI server only verifies tokens: PyJWT with the project's JWKS (ES256/RS256, keys cached, refetched on unknown `kid`), or HS256 with `SUPABASE_JWT_SECRET` when set. Checks `aud == authenticated`, `iss == {SUPABASE_URL}/auth/v1`, expiry, `sub`. Email must be in `ALLOWED_EMAILS` (case-insensitive) else 403 `{"detail":"no_access"}`.
- `require_auth` returns a `User(id, email)`. Every vocabulary, topic, stats and review function in `app/vocab.py` takes `user_id` first and filters by it. `GET /api/me` added. `POST /api/auth/login`, `PWA_PASSWORD`, the login throttle and `JWT_SECRET` are removed.
- Owner claim: the first request (per process) from `OWNER_EMAIL` assigns words with `user_id IS NULL` to that user. Words whose spelling the owner already has are left unowned, so the unique index cannot be violated.
- MCP: `/authorize` redirects to `{ISSUER_URL}/connect?request=<id>`. The PWA page signs the person in and, on "Дозволити", POSTs to `POST /api/connect` (Supabase token, allowlist check). The pending request is single use and is not consumed by a refused (401/403) attempt. The auth code, refresh token and access token carry the user id; tools read it from the access token and are scoped to it. The password page (`/authorize/submit`) and `oauth_templates.py` are deleted.
- Frontend: `@supabase/supabase-js` 2.109.0. Auth screen (Увійти / Створити акаунт, Google, Забули пароль?), new-password screen after a reset link, "Немає доступу" screen, `/connect` page, menu shows the email, Вийти signs out. API client attaches the Supabase access token, signs out on 401. Query cache cleared on sign-out.

## File map

Backend: `app/auth.py` (rewritten), `app/config.py`, `app/db.py` (schema), `app/vocab.py`, `app/api.py`, `app/models.py`, `app/mcp_tools.py`, `app/oauth_provider.py`, `app/oauth_store.py`, `app/oauth_templates.py` (deleted). Config/docs: `render.yaml`, `.env.example`, `README.md`, `requirements.txt` (`PyJWT[crypto]`), `tools/smoke_test.py`.
Web: `web/src/lib/supabase.ts`, `lib/auth.ts`, `api/client.ts`, `api/endpoints.ts`, `api/hooks.ts` (`useMe`), `routes/Auth.tsx` (+css, renamed from Login), `routes/NoAccess.tsx`, `routes/Connect.tsx`, `routes/RootLayout.tsx` (gate), `router.tsx`, `components/Menu.tsx`.

## Migration behaviour

- `init_db` (idempotent): `words.user_id uuid`, drops `uix_words_word_lower`, creates unique `(user_id, lower(word))` and `(user_id, section)` indexes; `user_id TEXT` added to `oauth_auth_codes` and `oauth_refresh_tokens`. Verified on a database created with the old schema.
- Existing words keep `user_id NULL` and are invisible until `OWNER_EMAIL` signs in once, which claims them all.
- Existing MCP clients: old access tokens (no `cid` claim) and old refresh tokens (no `user_id`) are rejected, so Claude shows the connector as needing reconnection. Reconnect once per person; registered OAuth clients stay valid. Pending authorizations live in memory and are lost on restart (as before).
- Anyone who signs up but is not on `ALLOWED_EMAILS` gets the no-access screen; all their API calls return 403.

## Tests

`TEST_DATABASE_URL=postgresql:///lexi_test python -m pytest -q`: 99 passed, 1 skipped (real-build test, skipped without `web/dist`).
- `tests/test_auth.py`: missing/invalid/expired/wrong-signature/wrong-aud/wrong-issuer/no-sub/unsigned tokens (401), allowlist (403, case-insensitive), `/api/me`, login route gone, ES256 via stubbed JWKS, JWKS outage gives 401.
- `tests/test_multi_user.py`: same word saved by two users, private lists/sections/stats/due/review, cross-user writes 404, topic rename, backfill, quick add, owner claim (first request, not by others, not others' words, spelling clash).
- `tests/test_mcp_oauth.py`: authorize redirect to `/connect`, connect endpoint (401/403/404/single use), full flow and tools, two connectors isolated, refresh keeps owner, legacy tokens rejected.
- Web: `npm --prefix web run build` (tsc + vite) passes. The auth screen was checked visually at 390px and 1440px, light and dark (Vite dev server pointed at the real project URL with no anon key; sign-in itself was not exercised).

## Deviations from the plan

- `oauth_templates.py` is deleted, not edited: no server-rendered page remains.
- Access-token JWT: `sub` is now the user id and `cid` the client id (RFC 9068 shape); the user id is surfaced to tools through `AccessToken.subject`.
- A 403 is detected through a `GET /api/me` call after sign-in (the gate), which adds one request before the app shows.
- Sign-up, Google and the reset email redirect back to the current URL (so `/connect?request=...` survives); the Supabase redirect allow-list must therefore use a wildcard.
- Without `VITE_SUPABASE_ANON_KEY` the client is built with a placeholder so the auth screen still renders (console warning); sign-in then fails.
- `tools/smoke_test.py` stops at the authorize redirect (no real login possible).

## Owner setup

1. Supabase dashboard, project `zmzwuiokweedafgeacef`:
   - Authentication > URL Configuration: Site URL `https://lexivocab.onrender.com`; Redirect URLs: `https://lexivocab.onrender.com/**` and `http://localhost:5173/**`.
   - Authentication > Providers > Email: enabled, "Confirm email" on.
   - Authentication > Providers > Google: enable; paste the Google client id and secret (below).
   - Project Settings > API Keys: copy the public anon / publishable key (for `VITE_SUPABASE_ANON_KEY`).
2. Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID (Web application). Authorized redirect URI: `https://zmzwuiokweedafgeacef.supabase.co/auth/v1/callback`. Configure the consent screen (scopes: email, profile).
3. Render > service `lexivocab` > Environment:
   - `SUPABASE_URL` = `https://zmzwuiokweedafgeacef.supabase.co`
   - `ALLOWED_EMAILS` = comma-separated emails of everyone invited (including yours)
   - `OWNER_EMAIL` = your email (inherits the existing words)
   - `VITE_SUPABASE_URL` = same as `SUPABASE_URL`; `VITE_SUPABASE_ANON_KEY` = the anon key (both are read at build time, so redeploy after setting)
   - keep `MCP_SECRET` (now only a signing key; do not change it unless you want to invalidate all connector tokens); delete `PWA_PASSWORD` and `JWT_SECRET`.
   - `SUPABASE_JWT_SECRET` is only needed for a legacy HS256 project; leave unset otherwise.
4. Deploy, open the app, sign in once with `OWNER_EMAIL` (claims the old words), then reconnect the Claude connector (remove and add, or re-authorize) and press "Дозволити".
5. Local dev: put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `web/.env.local`; backend needs `SUPABASE_URL`, `ALLOWED_EMAILS`, `OWNER_EMAIL`, `MCP_SECRET`.
