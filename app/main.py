"""Single ASGI app: MCP (+OAuth) at /mcp and /.well-known, REST API at /api, PWA at /."""

from contextlib import asynccontextmanager
from pathlib import Path

import anyio
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from app import config, db
from app.api import api
from app.mcp_tools import mcp

PWA_DIR = Path(__file__).resolve().parent.parent / "pwa"

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
app.router.routes.append(Mount("/", app=StaticFiles(directory=PWA_DIR, html=True), name="pwa"))
