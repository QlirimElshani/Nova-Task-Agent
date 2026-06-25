from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserRead,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    user = await auth_service.register(db, data)
    token = create_access_token(user.id)
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(
    data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    user = await auth_service.authenticate(db, data)
    token = create_access_token(user.id)
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(_data: ForgotPasswordRequest) -> MessageResponse:
    # No email infrastructure in this task. We always return success so the
    # response can't be used to discover which emails have accounts.
    return MessageResponse(
        message="If an account exists for that email, a reset link has been sent."
    )


@router.get("/me", response_model=UserRead)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserRead:
    return UserRead.model_validate(user)
