"""Single ASGI app: MCP (+OAuth) at /mcp and /.well-known, REST API at /api, PWA at /."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import anyio
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from app import config, db
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

PWA_DIR = Path(__file__).resolve().parent.parent / "pwa"


class PWAStaticFiles(StaticFiles):
    """PWA files with `Cache-Control: no-cache`: the browser may keep them but must revalidate
    (cheap 304 via ETag), so a deploy never pairs new HTML with a stale style.css or app.js."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response

# FastMCP builds a Starlette app that already carries the OAuth routes, the bearer-auth
# middleware and the MCP session manager lifespan; we extend it instead of nesting it.
app = mcp.streamable_http_app()

_mcp_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(a):
    await anyio.to_thread.run_sync(db.init_db)  # idempotent CREATE TABLE IF NOT EXISTS
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
app.router.routes.append(Mount("/", app=PWAStaticFiles(directory=PWA_DIR, html=True), name="pwa"))
