"""Single ASGI app: MCP (+OAuth) at /mcp and /.well-known, REST API at /api, React PWA (web/dist) at /."""

import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import anyio
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from app import config, db, translator
from app.api import api
from app.mcp_tools import mcp

# App-level INFO logs (e.g. translation timing) go to stdout, which Render shows under Logs.
_app_log = logging.getLogger("app")
if not _app_log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    _app_log.addHandler(_handler)
    _app_log.setLevel(logging.INFO)
    _app_log.propagate = False

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

IMMUTABLE = "public, max-age=31536000, immutable"


class SPAStaticFiles(StaticFiles):
    """Serves the built React app.

    - Vite's hashed files under /assets/ are cached for a year; everything else (index.html,
      sw.js, manifest.webmanifest, icons) is `no-cache`: the browser may keep it but must
      revalidate (cheap 304 via ETag), so a deploy never pairs new HTML with stale code.
    - Unknown paths that a browser navigates to (Accept: text/html) get index.html, so client-side
      routes such as /topic/Їжа survive a reload. Missing files (an old /assets/x.js) stay 404.
    """

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or path.startswith("assets/"):
                raise
            accept = dict(scope["headers"]).get(b"accept", b"").decode("latin-1")
            if "text/html" not in accept:
                raise
            return await super().get_response("index.html", scope)

    def file_response(self, full_path, *args, **kwargs):
        response = super().file_response(full_path, *args, **kwargs)
        in_assets = Path(full_path).parent.name == "assets"
        response.headers["Cache-Control"] = IMMUTABLE if in_assets else "no-cache"
        return response


# FastMCP builds a Starlette app that already carries the OAuth routes, the bearer-auth
# middleware and the MCP session manager lifespan; we extend it instead of nesting it.
app = mcp.streamable_http_app()

_mcp_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(a):
    await anyio.to_thread.run_sync(db.init_db)  # idempotent CREATE TABLE IF NOT EXISTS
    threading.Thread(target=translator.warm_up, daemon=True).start()  # don't delay startup
    try:
        async with _mcp_lifespan(a):
            yield
    finally:
        await anyio.to_thread.run_sync(db.close_pool)


app.router.lifespan_context = lifespan


async def prm_root(request):
    """Same protected-resource metadata, also at the root path (some clients look there)."""
    return JSONResponse(
        {
            "resource": f"{config.ISSUER_URL}{config.MCP_PATH}",
            "authorization_servers": [f"{config.ISSUER_URL}/"],
            "bearer_methods_supported": ["header"],
        }
    )


if not any(getattr(r, "path", "") == "/.well-known/oauth-protected-resource" for r in app.router.routes):
    app.router.routes.append(
        Route("/.well-known/oauth-protected-resource", prm_root, methods=["GET", "OPTIONS"])
    )

app.router.routes.append(Mount("/api", app=api))
# html=True serves index.html at "/". Must be last: it matches everything else.
# check_dir=False: the server (and the tests) start without a built web/dist; "/" is then a 404.
app.router.routes.append(
    Mount("/", app=SPAStaticFiles(directory=WEB_DIST, html=True, check_dir=False), name="web")
)
