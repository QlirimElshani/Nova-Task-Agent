from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import UnauthorizedError
from app.core.security import decode_token
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services import auth_service


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if creds is None:
        raise UnauthorizedError("Not authenticated.")
    user_id = decode_token(creds.credentials)
    if user_id is None:
        raise UnauthorizedError("Invalid or expired token.")
    user = await auth_service.get_by_id(db, user_id)
    if user is None:
        raise UnauthorizedError("Invalid or expired token.")
    return user
