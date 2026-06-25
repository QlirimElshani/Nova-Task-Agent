from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationRead,
    ConversationSummary,
    MessagesAppend,
)
from app.services import conversations_service

router = APIRouter(prefix="/conversations", tags=["conversations"])

CurrentUser = Annotated[User, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(user: CurrentUser, db: Db) -> list[ConversationSummary]:
    rows = await conversations_service.list_conversations(db, user.id)
    return [ConversationSummary(**r) for r in rows]


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate, user: CurrentUser, db: Db
) -> ConversationRead:
    conv = await conversations_service.create_conversation(db, user.id, data)
    return ConversationRead.model_validate(conv)


@router.get("/{conv_id}", response_model=ConversationRead)
async def get_conversation(conv_id: str, user: CurrentUser, db: Db) -> ConversationRead:
    conv = await conversations_service.get_conversation(db, user.id, conv_id)
    return ConversationRead.model_validate(conv)


@router.post("/{conv_id}/messages", response_model=ConversationRead)
async def append_messages(
    conv_id: str, data: MessagesAppend, user: CurrentUser, db: Db
) -> ConversationRead:
    conv = await conversations_service.append_messages(db, user.id, conv_id, data.messages)
    return ConversationRead.model_validate(conv)


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conv_id: str, user: CurrentUser, db: Db) -> None:
    await conversations_service.delete_conversation(db, user.id, conv_id)
