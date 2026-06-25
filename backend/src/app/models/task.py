from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Task(Base):
    """A single personal task.

    Fields map directly to the task spec: Title, Description, Status, Created date.
    `completed` carries the Completed / Not-completed status; `created_at` the date.
    """

    __tablename__ = "tasks"

    # Case-insensitive uniqueness on title: a DB-level backstop to the check in
    # tasks_service (guards the create/create race the app-level check can't).
    # Expressed as a functional index on lower(title) so "Buy milk" == "buy milk".
    __table_args__ = (
        Index("uq_tasks_title_lower", text("lower(title)"), unique=True),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
