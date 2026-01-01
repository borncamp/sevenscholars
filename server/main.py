from __future__ import annotations

import asyncio
import datetime
import json
import secrets
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Setting, Share
from .prompts import TRADITION_PROMPTS, get_tradition_prompts
from .schemas import (
    AnswerResponse,
    AskResponse,
    QuestionRequest,
    ShareRequest,
    ShareResponse,
    ShareSummary,
    SettingsResponse,
    SettingsUpdate,
)

app = FastAPI(title="Three Scholar Answers", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).resolve().parent.parent / "client"
app.mount("/static", StaticFiles(directory=static_dir, html=False), name="static")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


def _get_setting_row(db: Session) -> Setting:
    setting = db.query(Setting).filter(Setting.id == 1).first()
    if not setting:
        setting = Setting(id=1, openai_api_key=None)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


@app.get("/api/settings", response_model=SettingsResponse)
def read_settings(db: Session = Depends(get_db)) -> SettingsResponse:
    setting = _get_setting_row(db)
    updated = setting.updated_at.isoformat() if setting.updated_at else None
    return SettingsResponse(has_api_key=bool(setting.openai_api_key), last_updated=updated)


@app.post("/api/settings", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> SettingsResponse:
    setting = _get_setting_row(db)
    setting.openai_api_key = payload.api_key.strip()
    db.add(setting)
    db.commit()
    db.refresh(setting)
    updated = setting.updated_at.isoformat() if setting.updated_at else None
    return SettingsResponse(has_api_key=bool(setting.openai_api_key), last_updated=updated)


async def _ask_single(
    client: AsyncOpenAI, question: str, tradition: str, persona: str, timeout: float = 20.0
) -> AnswerResponse:
    messages = [
        {"role": "system", "content": persona},
        {"role": "user", "content": question},
    ]
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=600,
                temperature=0.7,
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail=f"{tradition} response timed out") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"LLM call failed for {tradition}: {exc}") from exc

    answer_text = completion.choices[0].message.content.strip()
    return AnswerResponse(tradition=tradition, answer=answer_text)


async def _ask_openai(question: str, api_key: str, prompts: List[tuple[str, str]]) -> List[AnswerResponse]:
    client = AsyncOpenAI(api_key=api_key)
    tasks = [
        _ask_single(client, question, tradition, persona)
        for tradition, persona in prompts
    ]
    answers = await asyncio.gather(*tasks)
    return answers


@app.post("/api/ask", response_model=AskResponse)
async def ask_question(payload: QuestionRequest, db: Session = Depends(get_db)) -> AskResponse:
    setting = _get_setting_row(db)
    if not setting.openai_api_key:
        raise HTTPException(status_code=400, detail="Set the OpenAI API key in Settings first.")

    try:
        prompts = get_tradition_prompts(payload.traditions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    answers = await _ask_openai(payload.question.strip(), setting.openai_api_key, prompts)
    share = _persist_share(db, payload.question.strip(), payload.traditions, answers)
    return AskResponse(
        answers=answers,
        slug=share.slug,
    )


def _generate_slug(db: Session, length: int = 7) -> str:
    for _ in range(5):
        slug = secrets.token_urlsafe(length)[:length]
        exists = db.query(Share).filter(Share.slug == slug).first()
        if not exists:
            return slug
    raise HTTPException(status_code=500, detail="Unable to generate share link. Try again.")


def _validate_share(payload: ShareRequest) -> None:
    total_answer_len = sum(len(a.answer) for a in payload.answers)
    if total_answer_len > 8000:
        raise HTTPException(status_code=400, detail="Answers too long to share.")
    for t in payload.traditions:
        if t not in TRADITION_PROMPTS:
            raise HTTPException(status_code=400, detail=f"Unsupported tradition: {t}")


def _persist_share(
    db: Session, question: str, traditions: list[str], answers: list[AnswerResponse]
) -> Share:
    payload = ShareRequest(question=question, traditions=traditions, answers=answers)  # type: ignore[arg-type]
    _validate_share(payload)
    slug = _generate_slug(db)
    share = Share(
        slug=slug,
        question=question,
        traditions=json.dumps(traditions),
        answers=json.dumps([a.model_dump() for a in answers]),
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


@app.post("/api/share", response_model=ShareResponse)
def create_share(payload: ShareRequest, db: Session = Depends(get_db)) -> ShareResponse:
    _validate_share(payload)
    share = _persist_share(db, payload.question.strip(), payload.traditions, payload.answers)
    return ShareResponse(
        slug=share.slug,
        question=share.question,
        traditions=json.loads(share.traditions),
        answers=[AnswerResponse(**a) for a in json.loads(share.answers)],
        created_at=share.created_at.isoformat(),
    )


@app.get("/api/share/{slug}", response_model=ShareResponse)
def read_share(slug: str, db: Session = Depends(get_db)) -> ShareResponse:
    share = db.query(Share).filter(Share.slug == slug).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    return ShareResponse(
        slug=share.slug,
        question=share.question,
        traditions=json.loads(share.traditions),
        answers=[AnswerResponse(**a) for a in json.loads(share.answers)],
        created_at=share.created_at.isoformat(),
    )


@app.get("/api/shares", response_model=List[ShareSummary])
def list_shares(db: Session = Depends(get_db)) -> List[ShareSummary]:
    shares = (
        db.query(Share)
        .order_by(Share.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        ShareSummary(
            slug=s.slug,
            question=s.question,
            created_at=s.created_at.isoformat(),
        )
        for s in shares
    ]


@app.get("/", include_in_schema=False)
def root() -> FileResponse:
    index_file = static_dir / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend not built")
    return FileResponse(index_file)


@app.get("/settings", include_in_schema=False)
def settings_page() -> FileResponse:
    index_file = static_dir / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend not built")
    return FileResponse(index_file)


@app.get("/shares", include_in_schema=False)
def shares_page() -> FileResponse:
    page = static_dir / "shares.html"
    if not page.exists():
        raise HTTPException(status_code=404, detail="Shares page not found")
    return FileResponse(page)
