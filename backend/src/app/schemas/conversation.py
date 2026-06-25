from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MessageIn(BaseModel):
    """One turn the client is saving to history."""

    role: str = Field(pattern="^(user|agent)$")
    text: str = Field(max_length=8000)

    @field_validator("text")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return v.strip()


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    text: str
    created_at: datetime


class ConversationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    messages: list[MessageIn] = Field(default_factory=list, max_length=200)

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be blank.")
        return v


class MessagesAppend(BaseModel):
    messages: list[MessageIn] = Field(min_length=1, max_length=50)


class ConversationSummary(BaseModel):
    """A row in the history panel - no message bodies, just enough to list."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    updated_at: datetime
    message_count: int


class ConversationRead(BaseModel):
    """A full conversation with its messages, for reopening."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageRead]
