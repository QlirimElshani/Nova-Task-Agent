from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import NotFoundError
from app.models.conversation import Conversation, Message
from app.schemas.conversation import ConversationCreate, MessageIn

# How many summaries the history panel loads. Generous but bounded.
_LIST_LIMIT = 100


async def list_conversations(db: AsyncSession, user_id: str) -> list[dict]:
    """Summaries for the history panel: id, title, updated_at, message_count.

    Newest activity first. Returns plain dicts so the count (an aggregate, not a
    model column) maps cleanly onto ConversationSummary.
    """
    stmt = (
        select(
            Conversation.id,
            Conversation.title,
            Conversation.updated_at,
            func.count(Message.id).label("message_count"),
        )
        .where(Conversation.user_id == user_id)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
        .limit(_LIST_LIMIT)
    )
    rows = await db.execute(stmt)
    return [
        {
            "id": r.id,
            "title": r.title,
            "updated_at": r.updated_at,
            "message_count": r.message_count,
        }
        for r in rows.all()
    ]


async def get_conversation(db: AsyncSession, user_id: str, conv_id: str) -> Conversation:
    """Fetch one conversation (with messages) the user owns, or 404."""
    conv = await db.get(Conversation, conv_id)
    if conv is None or conv.user_id != user_id:
        raise NotFoundError("Conversation not found")
    return conv


async def create_conversation(
    db: AsyncSession, user_id: str, data: ConversationCreate
) -> Conversation:
    conv = Conversation(user_id=user_id, title=data.title)
    conv.messages = [Message(role=m.role, text=m.text) for m in data.messages]
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


async def append_messages(
    db: AsyncSession, user_id: str, conv_id: str, messages: list[MessageIn]
) -> Conversation:
    conv = await get_conversation(db, user_id, conv_id)
    for m in messages:
        conv.messages.append(Message(role=m.role, text=m.text))
    # Appending a child row does not dirty the parent, so onupdate would not
    # fire. Set updated_at explicitly so this conversation rises to the top of
    # the history list.
    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(conv)
    return conv


async def delete_conversation(db: AsyncSession, user_id: str, conv_id: str) -> None:
    conv = await get_conversation(db, user_id, conv_id)
    await db.delete(conv)  # cascade removes messages
    await db.commit()
