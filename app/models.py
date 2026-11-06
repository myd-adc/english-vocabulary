"""Pydantic request/response models for the REST API."""

from typing import Literal

from pydantic import BaseModel, Field

Direction = Literal["forward", "reverse"]


class WordCreate(BaseModel):
    word: str = Field(description="English word or phrase")
    translation: str = Field(description="Ukrainian translation")
    transcription: str | None = Field(None, description="IPA transcription, e.g. /ˈæp.əl/")
    part_of_speech: str | None = None
    example: str | None = Field(None, description="English example sentence")
    example_translation: str | None = Field(None, description="Ukrainian translation of the example")
    notes: str | None = None
    section: str | None = None
    main_translation: str | None = None
    definition: str | None = Field(None, description="Short English explanation of the meaning")
    definition_uk: str | None = Field(None, description="Short Ukrainian explanation of the meaning")


class WordUpdate(BaseModel):
    """Partial update: only the fields that are sent are changed (null clears optional ones)."""

    word: str | None = None
    translation: str | None = None
    transcription: str | None = None
    part_of_speech: str | None = None
    example: str | None = None
    example_translation: str | None = None
    notes: str | None = None
    section: str | None = None
    main_translation: str | None = None
    definition: str | None = None
    definition_uk: str | None = None


class WordResponse(BaseModel):
    id: int
    word: str
    translation: str
    transcription: str | None = None
    part_of_speech: str | None = None
    example: str | None = None
    example_translation: str | None = None
    notes: str | None = None
    section: str | None = None
    main_translation: str | None = None
    definition: str | None = None
    definition_uk: str | None = None
    created_at: str
    # EN -> UA schedule
    interval: int
    ease_factor: float
    repetitions: int
    lapses: int
    next_review: str
    # UA -> EN schedule
    reverse_interval: int
    reverse_ease_factor: float
    reverse_repetitions: int
    reverse_lapses: int
    reverse_next_review: str


class BulkCreate(BaseModel):
    words: list[WordCreate] = Field(min_length=1, max_length=50)


class BulkResponse(BaseModel):
    inserted: list[WordResponse]
    skipped: list[str]
    skipped_count: int


class WordListResponse(BaseModel):
    total: int
    words: list[WordResponse]


class ReviewRequest(BaseModel):
    quality: int = Field(ge=0, le=5, description="SM-2 quality: 0 Again, 3 Hard, 4 Good, 5 Easy")


ExplainLang = Literal["uk", "en"]


class MeResponse(BaseModel):
    id: str
    email: str
    explain_lang: ExplainLang = "uk"


class SettingsUpdate(BaseModel):
    explain_lang: ExplainLang


class ConnectRequest(BaseModel):
    request: str


class ConnectResponse(BaseModel):
    redirect_url: str


class SectionResponse(BaseModel):
    name: str
    words: int
    due: int
    due_reverse: int


class StatsResponse(BaseModel):
    total: int
    due_today: int
    due_today_reverse: int
    learned: int
    difficult: int
    sections: int


class QuickAddRequest(BaseModel):
    text: str


class QuickAddResponse(BaseModel):
    status: str
    input: str
    word: WordResponse | None = None


class TopicRename(BaseModel):
    name: str
