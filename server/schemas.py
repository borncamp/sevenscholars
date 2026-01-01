from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SettingsUpdate(BaseModel):
    api_key: str = Field(..., min_length=8, description="OpenAI API key")


class SettingsResponse(BaseModel):
    has_api_key: bool
    last_updated: Optional[str] = None


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=4)
    traditions: list[str] = Field(..., min_items=1, max_items=7, description="Selected traditions to answer the question")


class AnswerResponse(BaseModel):
    tradition: str
    answer: str


class AskResponse(BaseModel):
    answers: list[AnswerResponse]
    slug: str | None = None


class ShareRequest(BaseModel):
    question: str = Field(..., min_length=4, max_length=500)
    traditions: list[str] = Field(..., min_items=1, max_items=7)
    answers: list[AnswerResponse]


class ShareResponse(BaseModel):
    slug: str
    question: str
    traditions: list[str]
    answers: list[AnswerResponse]
    created_at: str


class ShareSummary(BaseModel):
    slug: str
    question: str
    created_at: str
