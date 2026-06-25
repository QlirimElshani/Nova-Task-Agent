from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ConflictError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    stmt = select(User).where(func.lower(User.email) == _normalize_email(email))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, user_id: str) -> User | None:
    return await db.get(User, user_id)


async def register(db: AsyncSession, data: RegisterRequest) -> User:
    if await get_by_email(db, data.email) is not None:
        raise ConflictError("An account with this email already exists.")

    user = User(
        name=data.name,
        email=_normalize_email(data.email),
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, data: LoginRequest) -> User:
    user = await get_by_email(db, data.email)
    # Verify even when the user is missing-ish to keep timing uniform where it matters;
    # here we simply return a generic error so we don't leak which emails exist.
    if user is None or not verify_password(data.password, user.password_hash):
        raise UnauthorizedError("Invalid email or password.")
    return user
