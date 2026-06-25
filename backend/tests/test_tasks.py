from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_create_list_and_get(client):
    # create
    r = await client.post(
        "/api/v1/tasks", json={"title": "Buy groceries", "description": "Milk and eggs"}
    )
    assert r.status_code == 201
    created = r.json()
    assert created["title"] == "Buy groceries"
    assert created["completed"] is False
    assert created["id"]
    task_id = created["id"]

    # list
    r = await client.get("/api/v1/tasks")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["data"][0]["id"] == task_id

    # get one
    r = await client.get(f"/api/v1/tasks/{task_id}")
    assert r.status_code == 200
    assert r.json()["title"] == "Buy groceries"


@pytest.mark.asyncio
async def test_toggle_complete_and_delete(client):
    r = await client.post("/api/v1/tasks", json={"title": "Walk the dog"})
    task_id = r.json()["id"]

    # mark completed
    r = await client.patch(f"/api/v1/tasks/{task_id}", json={"completed": True})
    assert r.status_code == 200
    assert r.json()["completed"] is True

    # mark not completed
    r = await client.patch(f"/api/v1/tasks/{task_id}", json={"completed": False})
    assert r.json()["completed"] is False

    # delete
    r = await client.delete(f"/api/v1/tasks/{task_id}")
    assert r.status_code == 204

    r = await client.get(f"/api/v1/tasks/{task_id}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_all_clears_every_task(client):
    await client.post("/api/v1/tasks", json={"title": "One"})
    await client.post("/api/v1/tasks", json={"title": "Two"})
    await client.post("/api/v1/tasks", json={"title": "Three"})

    r = await client.delete("/api/v1/tasks")
    assert r.status_code == 204

    r = await client.get("/api/v1/tasks")
    assert r.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_all_on_empty_list_is_noop(client):
    # Clearing when there is nothing to clear still succeeds (idempotent).
    r = await client.delete("/api/v1/tasks")
    assert r.status_code == 204

    r = await client.get("/api/v1/tasks")
    assert r.json()["total"] == 0


@pytest.mark.asyncio
async def test_validation_rejects_blank_title(client):
    r = await client.post("/api/v1/tasks", json={"title": "   "})
    assert r.status_code == 422

    r = await client.post("/api/v1/tasks", json={"description": "no title"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_search_by_title(client):
    await client.post("/api/v1/tasks", json={"title": "Prepare sprint demo"})
    await client.post("/api/v1/tasks", json={"title": "Buy coffee"})

    r = await client.get("/api/v1/tasks", params={"q": "demo"})
    body = r.json()
    assert body["total"] == 1
    assert body["data"][0]["title"] == "Prepare sprint demo"


@pytest.mark.asyncio
async def test_filter_by_status(client):
    r1 = await client.post("/api/v1/tasks", json={"title": "Active one"})
    r2 = await client.post("/api/v1/tasks", json={"title": "Done one"})
    await client.patch(f"/api/v1/tasks/{r2.json()['id']}", json={"completed": True})

    r = await client.get("/api/v1/tasks", params={"status": "active"})
    titles = [t["title"] for t in r.json()["data"]]
    assert titles == ["Active one"]

    r = await client.get("/api/v1/tasks", params={"status": "completed"})
    titles = [t["title"] for t in r.json()["data"]]
    assert titles == ["Done one"]

    # sanity: r1 stayed active
    assert r1.json()["completed"] is False


@pytest.mark.asyncio
async def test_update_missing_task_is_404(client):
    r = await client.patch("/api/v1/tasks/does-not-exist", json={"completed": True})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_duplicate_title_rejected(client):
    r = await client.post("/api/v1/tasks", json={"title": "Buy milk"})
    assert r.status_code == 201

    # exact duplicate
    r = await client.post("/api/v1/tasks", json={"title": "Buy milk"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CONFLICT"

    # case-insensitive + surrounding whitespace (title is stripped) still collides
    r = await client.post("/api/v1/tasks", json={"title": "  buy MILK "})
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_update_to_existing_title_rejected(client):
    await client.post("/api/v1/tasks", json={"title": "First"})
    r2 = await client.post("/api/v1/tasks", json={"title": "Second"})
    second_id = r2.json()["id"]

    # renaming "Second" onto "First" collides
    r = await client.patch(f"/api/v1/tasks/{second_id}", json={"title": "First"})
    assert r.status_code == 409

    # but a task keeping its own title (e.g. just toggling) is fine
    r = await client.patch(f"/api/v1/tasks/{second_id}", json={"title": "Second", "completed": True})
    assert r.status_code == 200
    assert r.json()["completed"] is True
