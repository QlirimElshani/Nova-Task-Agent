from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.task import TaskCreate, TaskList, TaskRead, TaskUpdate
from app.services import tasks_service

router = APIRouter(prefix="/tasks", tags=["tasks"])

StatusQuery = Annotated[str, Query(alias="status", pattern="^(all|active|completed)$")]


@router.get("", response_model=TaskList)
async def list_tasks(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = Query(default=None, description="Search by title (case-insensitive)"),
    status_: StatusQuery = "all",
) -> TaskList:
    tasks = await tasks_service.list_tasks(db, q=q, status=status_)
    return TaskList(data=[TaskRead.model_validate(t) for t in tasks], total=len(tasks))


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskRead:
    task = await tasks_service.get_task(db, task_id)
    return TaskRead.model_validate(task)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskRead:
    task = await tasks_service.create_task(db, data)
    return TaskRead.model_validate(task)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: str,
    data: TaskUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskRead:
    task = await tasks_service.update_task(db, task_id, data)
    return TaskRead.model_validate(task)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_tasks(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete every task in one request. Backs Nova's "delete all my tasks"."""
    await tasks_service.delete_all_tasks(db)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await tasks_service.delete_task(db, task_id)
