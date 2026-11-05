"""REST API, mounted at /api by app.main. Sync endpoints run in FastAPI's threadpool."""

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query

from app import auth, mcp_tools, vocab
from app.auth import User
from app.models import (
    BulkCreate,
    BulkResponse,
    ConnectRequest,
    ConnectResponse,
    Direction,
    MeResponse,
    QuickAddRequest,
    QuickAddResponse,
    ReviewRequest,
    SectionResponse,
    StatsResponse,
    TopicRename,
    WordCreate,
    WordListResponse,
    WordResponse,
    WordUpdate,
)

BACKFILL_BATCH = 10

api = FastAPI(title="Dicktionary API", docs_url="/docs", openapi_url="/openapi.json")


protected = APIRouter(dependencies=[Depends(auth.require_auth)])


@protected.get("/me", response_model=MeResponse)
def me(user: User = Depends(auth.require_auth)):
    return {"id": user.id, "email": user.email}


@protected.post("/connect", response_model=ConnectResponse)
async def connect(payload: ConnectRequest, user: User = Depends(auth.require_auth)):
    """Finish a Claude connector authorization for the signed-in person (see /connect in the PWA)."""
    provider = mcp_tools.oauth_provider
    pending = provider.take_pending(payload.request)
    if pending is None:
        raise HTTPException(status_code=404, detail="request_expired")
    redirect_url = await provider.complete_authorization(*pending, user_id=user.id)
    return {"redirect_url": redirect_url}


def _bad_request(err: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(err))


@protected.get("/sections", response_model=list[SectionResponse])
def sections(user: User = Depends(auth.require_auth)):
    return vocab.list_sections(user.id)


@protected.get("/stats", response_model=StatsResponse)
def stats(user: User = Depends(auth.require_auth)):
    return vocab.get_stats(user.id)


@protected.post("/vocabulary", response_model=WordResponse, status_code=201)
def add_word(payload: WordCreate, user: User = Depends(auth.require_auth)):
    try:
        return vocab.add_word(user.id, payload.model_dump())
    except vocab.DuplicateWord as err:
        raise HTTPException(status_code=409, detail="Таке слово вже є") from err
    except vocab.ValidationError as err:
        raise _bad_request(err) from err


@protected.post("/vocabulary/bulk", response_model=BulkResponse, status_code=201)
def bulk_add(payload: BulkCreate, user: User = Depends(auth.require_auth)):
    try:
        result = vocab.add_words(user.id, [w.model_dump() for w in payload.words])
    except vocab.ValidationError as err:
        raise _bad_request(err) from err
    return {**result, "skipped_count": len(result["skipped"])}


@protected.post("/vocabulary/quick", response_model=QuickAddResponse)
def quick_add(payload: QuickAddRequest, user: User = Depends(auth.require_auth)):
    try:
        return vocab.quick_add(user.id, payload.text)
    except vocab.ValidationError as err:
        raise _bad_request(err) from err


@protected.patch("/topics/{name}")
def rename_topic(name: str, payload: TopicRename, user: User = Depends(auth.require_auth)):
    try:
        updated = vocab.rename_topic(user.id, name, payload.name)
    except vocab.ValidationError as err:
        raise _bad_request(err) from err
    if updated == 0:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"updated": updated}


@protected.post("/topics/backfill")
def backfill_topics(user: User = Depends(auth.require_auth)):
    # capped per request to stay under proxy timeouts; the caller loops while `remaining` > 0 and stops when `updated` == 0 (translator unavailable)
    return vocab.backfill_topics(user.id, limit=BACKFILL_BATCH)


@protected.get("/vocabulary", response_model=WordListResponse)
def list_vocabulary(
    section: list[str] | None = Query(None, description="Repeat to filter by several topics"),
    due: Direction | None = Query(None, description="Only words due in this direction"),
    difficult: bool = Query(False),
    q: str | None = Query(None, description="Search in word / translation"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: User = Depends(auth.require_auth),
):
    return vocab.list_words(user.id, sections=section, due_direction=due, difficult=difficult, search=q,
                            limit=limit, offset=offset)


@protected.get("/vocabulary/due", response_model=list[WordResponse])
def due_vocabulary(
    direction: Direction = Query("forward"),
    section: list[str] | None = Query(None, description="Repeat to filter by several topics"),
    created_after: str | None = Query(None, description="YYYY-MM-DD"),
    user: User = Depends(auth.require_auth),
):
    return vocab.get_due(user.id, direction, created_after=created_after, sections=section)


@protected.patch("/vocabulary/{word_id}/review", response_model=WordResponse)
def review(word_id: int, payload: ReviewRequest, direction: Direction = Query("forward"), user: User = Depends(auth.require_auth)):
    result = vocab.review_word(user.id, word_id, payload.quality, direction)
    if result is None:
        raise HTTPException(status_code=404, detail="Word not found")
    return result


@protected.patch("/vocabulary/{word_id}", response_model=WordResponse)
def update_word(word_id: int, payload: WordUpdate, user: User = Depends(auth.require_auth)):
    try:
        result = vocab.update_word(user.id, word_id, payload.model_dump(exclude_unset=True))
    except vocab.DuplicateWord as err:
        raise HTTPException(status_code=409, detail="Таке слово вже є") from err
    except vocab.ValidationError as err:
        raise _bad_request(err) from err
    if result is None:
        raise HTTPException(status_code=404, detail="Word not found")
    return result


@protected.delete("/vocabulary/{word_id}", status_code=204)
def delete_word(word_id: int, user: User = Depends(auth.require_auth)):
    if not vocab.delete_word(user.id, word_id):
        raise HTTPException(status_code=404, detail="Word not found")


api.include_router(protected)
