from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from .db import Base


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    openai_api_key = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Share(Base):
    __tablename__ = "shares"

    slug = Column(String, primary_key=True, index=True)
    question = Column(Text, nullable=False)
    traditions = Column(Text, nullable=False)  # JSON string list
    answers = Column(Text, nullable=False)  # JSON string list of {tradition, answer}
    created_at = Column(DateTime, default=datetime.utcnow)
