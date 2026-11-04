"""OAuth 2.1 authorization server for the MCP connector (adapted from the original project).

Authorization Code + PKCE, Dynamic Client Registration, refresh-token rotation and
revocation. Access tokens are HS256 JWTs signed with MCP_SECRET; clients, codes and
refresh tokens live in Postgres. Whose dictionary a connector may touch is decided at the
authorize step: the person signs in to the PWA's /connect page (Supabase account, allowlist)
and the issued code, refresh token and access token all carry their user id. The DB layer is synchronous, so each call runs in
a worker thread to keep the event loop free.
"""

import asyncio
import json
import secrets
import time

import jwt
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl

from app import oauth_store as store

ACCESS_TOKEN_EXPIRY = 3600
REFRESH_TOKEN_EXPIRY = 30 * 24 * 3600
AUTH_CODE_EXPIRY = 300
PENDING_EXPIRY = 600

_run = asyncio.to_thread


class UserAuthorizationCode(AuthorizationCode):
    user_id: str


class UserRefreshToken(RefreshToken):
    user_id: str


class VocabularyOAuthProvider:
    def __init__(self, secret: str, issuer_url: str):
        self.secret = secret
        self.issuer_url = issuer_url
        # request id -> (client, params, created_at); lives in memory, lost on restart (the
        # user just starts the connection again).
        self._pending_params: dict[str, tuple[OAuthClientInformationFull, AuthorizationParams, float]] = {}

    # ── Clients ───────────────────────────────────────────────────────────────

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        row = await _run(store.get_client, client_id)
        if row is None:
            return None
        return OAuthClientInformationFull.model_validate_json(row["client_info_json"])

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        client_info.client_id = secrets.token_hex(16)
        client_info.client_secret = secrets.token_hex(32)
        client_info.client_id_issued_at = int(time.time())
        await _run(
            store.save_client,
            client_info.client_id,
            client_info.client_secret,
            client_info.model_dump_json(),
        )

    # ── Authorization ─────────────────────────────────────────────────────────

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        now = time.time()
        for nonce in [n for n, (_, _, t) in self._pending_params.items() if now - t > PENDING_EXPIRY]:
            del self._pending_params[nonce]
        request_id = secrets.token_hex(16)
        self._pending_params[request_id] = (client, params, now)
        # The PWA's /connect page signs the person in and posts the request back to /api/connect.
        return f"{self.issuer_url}/connect?request={request_id}"

    def take_pending(self, request_id: str) -> tuple[OAuthClientInformationFull, AuthorizationParams] | None:
        """Single use: returns and forgets a pending authorization (None if unknown or expired)."""
        entry = self._pending_params.pop(request_id, None)
        if entry is None or time.time() - entry[2] > PENDING_EXPIRY:
            return None
        return entry[0], entry[1]

    async def complete_authorization(
        self, client: OAuthClientInformationFull, params: AuthorizationParams, user_id: str
    ) -> str:
        code = secrets.token_hex(32)
        await _run(
            store.save_auth_code,
            code,
            client.client_id,
            params.code_challenge,
            str(params.redirect_uri),
            params.redirect_uri_provided_explicitly,
            json.dumps(params.scopes or []),
            time.time() + AUTH_CODE_EXPIRY,
            params.resource,
            user_id,
        )
        return construct_redirect_uri(str(params.redirect_uri), code=code, state=params.state)

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        row = await _run(store.get_auth_code, authorization_code)
        if row is None or not row.get("user_id"):
            return None
        if row["expires_at"] < time.time():
            await _run(store.delete_auth_code, authorization_code)
            return None
        if row["client_id"] != client.client_id:
            return None
        return UserAuthorizationCode(
            user_id=row["user_id"],
            code=row["code"],
            scopes=json.loads(row["scopes_json"]),
            expires_at=row["expires_at"],
            client_id=row["client_id"],
            code_challenge=row["code_challenge"],
            redirect_uri=AnyUrl(row["redirect_uri"]),
            redirect_uri_provided_explicitly=bool(row["redirect_uri_provided_explicitly"]),
            resource=row["resource"],
        )

    # ── Tokens ────────────────────────────────────────────────────────────────

    async def _issue(self, client_id: str, scopes: list[str], user_id: str) -> OAuthToken:
        now = int(time.time())
        access_token = jwt.encode(
            {
                "sub": user_id,  # the person whose dictionary this connector uses
                "cid": client_id,
                "jti": secrets.token_hex(16),
                "scopes": scopes,
                "iat": now,
                "exp": now + ACCESS_TOKEN_EXPIRY,
                "iss": self.issuer_url,
            },
            self.secret,
            algorithm="HS256",
        )
        refresh = secrets.token_hex(32)
        await _run(
            store.save_refresh_token, refresh, client_id, json.dumps(scopes), now + REFRESH_TOKEN_EXPIRY, user_id
        )
        return OAuthToken(
            access_token=access_token,
            token_type="Bearer",
            expires_in=ACCESS_TOKEN_EXPIRY,
            refresh_token=refresh,
            scope=" ".join(scopes) if scopes else None,
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        await _run(store.delete_auth_code, authorization_code.code)  # single use
        assert isinstance(authorization_code, UserAuthorizationCode)
        return await self._issue(client.client_id, authorization_code.scopes, authorization_code.user_id)

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        row = await _run(store.get_refresh_token, refresh_token)
        if row is None or not row.get("user_id"):  # issued before accounts: reconnect once
            return None
        if row["expires_at"] is not None and row["expires_at"] < time.time():
            await _run(store.delete_refresh_token, refresh_token)
            return None
        if row["client_id"] != client.client_id:
            return None
        return UserRefreshToken(
            user_id=row["user_id"],
            token=row["token"],
            client_id=row["client_id"],
            scopes=json.loads(row["scopes_json"]),
            expires_at=int(row["expires_at"]) if row["expires_at"] is not None else None,
        )

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        await _run(store.delete_refresh_token, refresh_token.token)  # rotation
        assert isinstance(refresh_token, UserRefreshToken)
        return await self._issue(
            client.client_id, scopes if scopes else refresh_token.scopes, refresh_token.user_id
        )

    async def load_access_token(self, token: str) -> AccessToken | None:
        try:
            payload = jwt.decode(
                token,
                self.secret,
                algorithms=["HS256"],
                options={"require": ["sub", "cid", "jti", "exp"]},  # no `cid`: pre-accounts token
            )
        except jwt.PyJWTError:
            return None
        if await _run(store.is_token_revoked, payload["jti"]):
            return None
        return AccessToken(
            token=token,
            client_id=payload["cid"],
            scopes=payload.get("scopes", []),
            expires_at=int(payload["exp"]),
            subject=payload["sub"],
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        if isinstance(token, AccessToken):
            try:
                payload = jwt.decode(
                    token.token, self.secret, algorithms=["HS256"], options={"require": ["jti"]}
                )
            except jwt.PyJWTError:
                return
            await _run(store.save_revoked_token, payload["jti"])
        elif isinstance(token, RefreshToken):
            await _run(store.delete_refresh_token, token.token)
