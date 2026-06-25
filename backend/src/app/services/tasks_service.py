from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ConflictError, NotFoundError
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate

# Status filter values accepted by list_tasks.
STATUS_ALL = "all"
STATUS_ACTIVE = "active"
STATUS_COMPLETED = "completed"


async def list_tasks(
    db: AsyncSession,
    *,
    q: str | None = None,
    status: str = STATUS_ALL,
) -> list[Task]:
    """List tasks newest-first, with optional title search (bonus) and status filter (bonus)."""
    stmt = select(Task)

    if status == STATUS_ACTIVE:
        stmt = stmt.where(Task.completed.is_(False))
    elif status == STATUS_COMPLETED:
        stmt = stmt.where(Task.completed.is_(True))

    if q:
        # Case-insensitive title search.
        stmt = stmt.where(func.lower(Task.title).like(f"%{q.lower()}%"))

    stmt = stmt.order_by(Task.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_task(db: AsyncSession, task_id: str) -> Task:
    task = await db.get(Task, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    return task


async def _assert_title_unique(
    db: AsyncSession, title: str, *, exclude_id: str | None = None
) -> None:
    """Raise ConflictError if another task already has this title.

    Match is case-insensitive on the trimmed title (TaskCreate/TaskUpdate already
    strip). `exclude_id` skips the task being updated so it can keep its own title.
    """
    stmt = select(Task.id).where(func.lower(Task.title) == title.lower())
    if exclude_id is not None:
        stmt = stmt.where(Task.id != exclude_id)
    existing = await db.execute(stmt)
    if existing.first() is not None:
        raise ConflictError("A task with this title already exists.")


async def create_task(db: AsyncSession, data: TaskCreate) -> Task:
    await _assert_title_unique(db, data.title)
    task = Task(title=data.title, description=data.description)
    db.add(task)
    try:
        await db.commit()
    except IntegrityError as exc:  # lost the create/create race to the unique index
        await db.rollback()
        raise ConflictError("A task with this title already exists.") from exc
    await db.refresh(task)
    return task


async def update_task(db: AsyncSession, task_id: str, data: TaskUpdate) -> Task:
    task = await get_task(db, task_id)
    fields = data.model_dump(exclude_unset=True)
    if "title" in fields and fields["title"] is not None:
        await _assert_title_unique(db, fields["title"], exclude_id=task_id)
    for field, value in fields.items():
        setattr(task, field, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("A task with this title already exists.") from exc
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task_id: str) -> None:
    task = await get_task(db, task_id)
    await db.delete(task)
    await db.commit()


async def delete_all_tasks(db: AsyncSession) -> int:
    """Delete every task in one statement. Returns how many rows were removed.

    Backs the "delete all my tasks" intent. The count lets the caller (and Nova)
    report exactly how many were cleared.
    """
    result = await db.execute(delete(Task))
    await db.commit()
    return result.rowcount or 0
