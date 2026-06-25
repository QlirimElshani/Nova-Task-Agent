from __future__ import annotations

import pytest

REGISTER = {"name": "Alex Rivera", "email": "alex@nova.app", "password": "password"}


@pytest.mark.asyncio
async def test_register_returns_token_and_user(client):
    r = await client.post("/api/v1/auth/register", json=REGISTER)
    assert r.status_code == 201
    body = r.json()
    assert body["token"]
    assert body["user"]["email"] == "alex@nova.app"
    assert body["user"]["name"] == "Alex Rivera"
    assert "password" not in str(body)  # never leak the password / hash


@pytest.mark.asyncio
async def test_register_duplicate_email_is_409(client):
    await client.post("/api/v1/auth/register", json=REGISTER)
    r = await client.post(
        "/api/v1/auth/register", json={**REGISTER, "email": "ALEX@nova.app"}
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CONFLICT"


@pytest.mark.asyncio
async def test_register_validation(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": "A", "email": "not-an-email", "password": "short"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_login_success_and_failure(client):
    await client.post("/api/v1/auth/register", json=REGISTER)

    r = await client.post(
        "/api/v1/auth/login", json={"email": "alex@nova.app", "password": "password"}
    )
    assert r.status_code == 200
    assert r.json()["token"]

    r = await client.post(
        "/api/v1/auth/login", json={"email": "alex@nova.app", "password": "wrong"}
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_me_requires_and_accepts_token(client):
    reg = await client.post("/api/v1/auth/register", json=REGISTER)
    token = reg.json()["token"]

    # no token → 401
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401

    # valid token → the user
    r = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    assert r.json()["email"] == "alex@nova.app"


@pytest.mark.asyncio
async def test_forgot_password_always_ok(client):
    r = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "nobody@nowhere.app"}
    )
    assert r.status_code == 200
    assert "message" in r.json()
