from __future__ import annotations

import pytest


async def _auth(client, email: str) -> dict:
    """Register a user and return an Authorization header for them."""
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": "User", "email": email, "password": "password"},
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.mark.asyncio
async def test_create_list_get_append_delete(client):
    h = await _auth(client, "a@nova.app")

    # create with an initial turn
    r = await client.post(
        "/api/v1/conversations",
        json={
            "title": "Call the bank",
            "messages": [
                {"role": "user", "text": "remind me to call the bank"},
                {"role": "agent", "text": "I drafted a task for you."},
            ],
        },
        headers=h,
    )
    assert r.status_code == 201
    conv = r.json()
    assert conv["title"] == "Call the bank"
    assert len(conv["messages"]) == 2
    conv_id = conv["id"]

    # list -> one summary with the right count
    r = await client.get("/api/v1/conversations", headers=h)
    assert r.status_code == 200
    summaries = r.json()
    assert len(summaries) == 1
    assert summaries[0]["id"] == conv_id
    assert summaries[0]["message_count"] == 2

    # append a turn
    r = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={"messages": [{"role": "user", "text": "yes add it"}]},
        headers=h,
    )
    assert r.status_code == 200
    assert len(r.json()["messages"]) == 3

    # get full thread
    r = await client.get(f"/api/v1/conversations/{conv_id}", headers=h)
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "agent", "user"]

    # delete
    r = await client.delete(f"/api/v1/conversations/{conv_id}", headers=h)
    assert r.status_code == 204
    r = await client.get(f"/api/v1/conversations/{conv_id}", headers=h)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_orders_by_recent_activity(client):
    h = await _auth(client, "a@nova.app")
    first = await client.post(
        "/api/v1/conversations", json={"title": "First"}, headers=h
    )
    second = await client.post(
        "/api/v1/conversations", json={"title": "Second"}, headers=h
    )
    first_id = first.json()["id"]

    # Touch the FIRST conversation so it becomes most-recent.
    await client.post(
        f"/api/v1/conversations/{first_id}/messages",
        json={"messages": [{"role": "user", "text": "hi again"}]},
        headers=h,
    )

    r = await client.get("/api/v1/conversations", headers=h)
    titles = [c["title"] for c in r.json()]
    assert titles[0] == "First"  # bumped to the top
    assert "Second" in titles


@pytest.mark.asyncio
async def test_requires_auth(client):
    # Every route is protected.
    assert (await client.get("/api/v1/conversations")).status_code == 401
    assert (
        await client.post("/api/v1/conversations", json={"title": "X"})
    ).status_code == 401
    assert (await client.get("/api/v1/conversations/anything")).status_code == 401
    assert (await client.delete("/api/v1/conversations/anything")).status_code == 401


@pytest.mark.asyncio
async def test_user_isolation(client):
    ha = await _auth(client, "a@nova.app")
    hb = await _auth(client, "b@nova.app")

    created = await client.post(
        "/api/v1/conversations", json={"title": "A's private chat"}, headers=ha
    )
    conv_id = created.json()["id"]

    # B cannot see A's conversation in their list...
    r = await client.get("/api/v1/conversations", headers=hb)
    assert r.json() == []

    # ...nor fetch, append to, or delete it (all 404 - not even existence leaks).
    assert (await client.get(f"/api/v1/conversations/{conv_id}", headers=hb)).status_code == 404
    r = await client.post(
        f"/api/v1/conversations/{conv_id}/messages",
        json={"messages": [{"role": "user", "text": "sneaky"}]},
        headers=hb,
    )
    assert r.status_code == 404
    assert (
        await client.delete(f"/api/v1/conversations/{conv_id}", headers=hb)
    ).status_code == 404

    # A still has it intact.
    assert (await client.get(f"/api/v1/conversations/{conv_id}", headers=ha)).status_code == 200


@pytest.mark.asyncio
async def test_validation_rejects_blank_title_and_bad_role(client):
    h = await _auth(client, "a@nova.app")
    assert (
        await client.post("/api/v1/conversations", json={"title": "   "}, headers=h)
    ).status_code == 422
    assert (
        await client.post(
            "/api/v1/conversations",
            json={"title": "ok", "messages": [{"role": "system", "text": "x"}]},
            headers=h,
        )
    ).status_code == 422
