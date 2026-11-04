"""REST API, mounted at /api by app.main. Sync endpoints run in FastAPI's threadpool."""

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query

from app import auth, config, vocab
from app.models import (
    BulkCreate,
    BulkResponse,
    Direction,
    LoginRequest,
    ReviewRequest,
    SectionResponse,
    StatsResponse,
    WordCreate,
    WordListResponse,
    WordResponse,
    WordUpdate,
)

api = FastAPI(title="LexiVocab API", docs_url="/docs", openapi_url="/openapi.json")


@api.post("/auth/login")
def login(payload: LoginRequest):
    if not auth.login_allowed():
        raise HTTPException(status_code=429, detail="Too many attempts, try again later")
    if not auth.check_password(payload.password, config.PWA_PASSWORD):
        auth.record_failure()
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"token": auth.create_token(), "token_type": "bearer"}


protected = APIRouter(dependencies=[Depends(auth.require_auth)])


def _bad_request(err: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(err))


@protected.get("/sections", response_model=list[SectionResponse])
def sections():
    return vocab.list_sections()


@protected.get("/stats", response_model=StatsResponse)
def stats():
    return vocab.get_stats()


@protected.post("/vocabulary", response_model=WordResponse, status_code=201)
def add_word(payload: WordCreate):
    try:
        return vocab.add_word(payload.model_dump())
    except vocab.DuplicateWord as err:
        raise HTTPException(status_code=409, detail="Таке слово вже є") from err
    except vocab.ValidationError as err:
        raise _bad_request(err) from err


@protected.post("/vocabulary/bulk", response_model=BulkResponse, status_code=201)
def bulk_add(payload: BulkCreate):
    try:
        result = vocab.add_words([w.model_dump() for w in payload.words])
    except vocab.ValidationError as err:
        raise _bad_request(err) from err
    return {**result, "skipped_count": len(result["skipped"])}


@protected.get("/vocabulary", response_model=WordListResponse)
def list_vocabulary(
    section: str | None = Query(None),
    due: Direction | None = Query(None, description="Only words due in this direction"),
    difficult: bool = Query(False),
    q: str | None = Query(None, description="Search in word / translation"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    return vocab.list_words(section=section, due_direction=due, difficult=difficult, search=q,
                            limit=limit, offset=offset)


@protected.get("/vocabulary/due", response_model=list[WordResponse])
def due_vocabulary(
    direction: Direction = Query("forward"),
    section: str | None = Query(None),
    created_after: str | None = Query(None, description="YYYY-MM-DD"),
):
    return vocab.get_due(direction, section, created_after)


@protected.patch("/vocabulary/{word_id}/review", response_model=WordResponse)
def review(word_id: int, payload: ReviewRequest, direction: Direction = Query("forward")):
    result = vocab.review_word(word_id, payload.quality, direction)
    if result is None:
        raise HTTPException(status_code=404, detail="Word not found")
    return result


@protected.patch("/vocabulary/{word_id}", response_model=WordResponse)
def update_word(word_id: int, payload: WordUpdate):
    try:
        result = vocab.update_word(word_id, payload.model_dump(exclude_unset=True))
    except vocab.DuplicateWord as err:
        raise HTTPException(status_code=409, detail="Таке слово вже є") from err
    except vocab.ValidationError as err:
        raise _bad_request(err) from err
    if result is None:
        raise HTTPException(status_code=404, detail="Word not found")
    return result


@protected.delete("/vocabulary/{word_id}", status_code=204)
def delete_word(word_id: int):
    if not vocab.delete_word(word_id):
        raise HTTPException(status_code=404, detail="Word not found")


api.include_router(protected)
