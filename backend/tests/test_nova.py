from __future__ import annotations

import json

import pytest

from app.services import nova_service


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    """Turn a raw SSE body into [(event_name, data_dict), ...]."""
    events: list[tuple[str, dict]] = []
    for frame in body.strip().split("\n\n"):
        name = data = None
        for line in frame.splitlines():
            if line.startswith("event:"):
                name = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data = json.loads(line[len("data:"):].strip())
        if name is not None:
            events.append((name, data or {}))
    return events


@pytest.fixture
def no_api_key(monkeypatch):
    """Force the local (no-Claude) path regardless of any .env key present."""
    monkeypatch.setattr(nova_service.settings, "anthropic_api_key", "")


@pytest.mark.asyncio
async def test_nova_stream_endpoint_local(client, no_api_key):
    # Local path: a canned reply delta, then a draft, then done. The stream
    # still produces a usable task with no key.
    r = await client.post(
        "/api/v1/nova/stream",
        json={"text": "remind me to call the bank tomorrow"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(r.text)
    names = [name for name, _ in events]
    assert "delta" in names
    assert names[-1] == "done"

    draft = next(data for name, data in events if name == "draft")
    assert draft["source"] == "local"
    assert "call the bank" in draft["title"].lower()
    assert draft["description"]


@pytest.mark.asyncio
async def test_nova_stream_vague_planning_clarifies(client, no_api_key):
    # "plan my week" streams a reply asking what to plan, with NO draft card.
    r = await client.post("/api/v1/nova/stream", json={"text": "plan my week"})
    assert r.status_code == 200
    events = _parse_sse(r.text)
    names = [name for name, _ in events]
    assert "delta" in names
    assert "draft" not in names  # did not auto-draft a generic task
    assert "meta" not in names  # no action card either
    assert names[-1] == "done"


@pytest.mark.asyncio
async def test_nova_stream_rejects_blank(client):
    r = await client.post("/api/v1/nova/stream", json={"text": "   "})
    assert r.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "text,intent",
    [
        ("show me all the tasks i have", "list"),
        ("mark call the bank as completed", "complete"),
        ("delete the grocery task", "delete"),
    ],
)
async def test_nova_stream_non_create_emits_meta(client, no_api_key, text, intent):
    # Non-create intents stream a reply then a `meta` event (no draft card).
    r = await client.post("/api/v1/nova/stream", json={"text": text})
    assert r.status_code == 200

    events = _parse_sse(r.text)
    names = [name for name, _ in events]
    assert "delta" in names
    assert "draft" not in names
    assert names[-1] == "done"

    meta = next(data for name, data in events if name == "meta")
    assert meta["intent"] == intent
    # The query keeps the task phrase, with the action verb stripped out.
    assert "task" not in meta["query"].lower()


def test_local_classifier_routes_intents():
    assert nova_service._classify_locally("show my tasks").intent == "list"
    assert nova_service._classify_locally("i finished the laundry").intent == "complete"
    assert nova_service._classify_locally("remove buy milk").intent == "delete"
    assert nova_service._classify_locally("call the bank tomorrow").intent == "create"


@pytest.mark.parametrize(
    "text",
    [
        "plan my week",
        "plan my day",
        "plan out my week",
        "organize my life",
        "help me be productive",
        "help me plan",
        "help me get organized",
        "sort out my schedule",
        "i want to get my life together",
        "be more productive",
    ],
)
def test_local_classifier_catches_vague_planning_as_clarify(text):
    # A broad goal with no concrete deliverable should ASK first, not draft a
    # generic "Plan my week" task.
    assert nova_service._classify_locally(text).intent == "clarify"


@pytest.mark.parametrize(
    "text",
    [
        "plan the sprint demo for friday",
        "plan dinner for saturday",
        "call the bank tomorrow",
        "buy groceries",
    ],
)
def test_specific_requests_stay_create(text):
    # A concrete, actionable item is still a create - clarify must not swallow it.
    assert nova_service._classify_locally(text).intent == "create"


@pytest.mark.asyncio
async def test_clarify_emits_no_card():
    # clarify produces a reply but no draft/meta card.
    intent = nova_service.NovaIntent(intent="clarify")
    events = [e async for e in nova_service._trailing_events("plan my week", intent)]
    assert events == []  # no trailing card event


def test_reconcile_overrides_create_to_clarify():
    # The model eagerly drafts "plan my week"; the local guardrail upgrades it to
    # clarify so Nova asks what to plan instead.
    model_said = nova_service.NovaIntent(
        intent="create", title="Plan my week", description="...", source="claude"
    )
    result = nova_service._reconcile("plan my week", model_said)
    assert result.intent == "clarify"
    assert result.source == "claude"


@pytest.mark.parametrize(
    "text",
    [
        "delete all my tasks",
        "delete all tasks",
        "delete all",
        "clear all tasks",
        "clear all my tasks",
        "remove all tasks",
        "remove everything",
        "wipe my list",
        "clear everything",
        "delete every task",
        "start over",
    ],
)
def test_local_classifier_catches_delete_all(text):
    # "delete all" / "clear everything" must route to delete_all, never to a
    # single-task delete (which would otherwise match the bare "delete" verb).
    assert nova_service._classify_locally(text).intent == "delete_all"


@pytest.mark.parametrize(
    "text",
    [
        "delete the bank task",
        "remove buy milk",
        "delete call the bank which is completed",
    ],
)
def test_single_delete_is_not_delete_all(text):
    # A delete that names ONE task stays a single delete.
    assert nova_service._classify_locally(text).intent == "delete"


def test_reconcile_overrides_to_delete_all():
    # If the model deflects "delete all my tasks" to a single delete/unknown, the
    # local guardrail upgrades it to delete_all.
    model_said = nova_service.NovaIntent(intent="delete", query="all tasks", source="claude")
    result = nova_service._reconcile("delete all my tasks", model_said)
    assert result.intent == "delete_all"
    assert result.source == "claude"


def test_local_classifier_extracts_query():
    intent = nova_service._classify_locally("mark call the bank as completed")
    assert intent.intent == "complete"
    assert "call" in intent.query.lower() and "bank" in intent.query.lower()


def test_local_classifier_keeps_status_words_in_query():
    # Status words must survive so the client can filter / disambiguate. The
    # client interprets them per intent (filter for list/delete, ignore for
    # complete).
    listing = nova_service._classify_locally("show me only not completed tasks")
    assert listing.intent == "list"
    assert "completed" in listing.query.lower()

    deleting = nova_service._classify_locally(
        "delete this task call the bank which is completed"
    )
    assert deleting.intent == "delete"
    q = deleting.query.lower()
    assert "completed" in q and "bank" in q


@pytest.mark.parametrize(
    "text",
    [
        "show me completed tasks",
        "show me all tasks",
        "what tasks do i have",
        "what do i have to do",
        "list my tasks",
        "do i have any tasks",
        "review my tasks",
    ],
)
def test_local_classifier_catches_list_phrasings(text):
    # The screenshot bug: these must all classify as list, deterministically.
    assert nova_service._classify_locally(text).intent == "list"


@pytest.mark.parametrize(
    "text",
    ["hi", "hello", "hey there", "thanks", "thank you", "who are you", "what can you do"],
)
def test_local_classifier_treats_chitchat_as_unknown(text):
    # Greetings must not be turned into a "create" task.
    assert nova_service._classify_locally(text).intent == "unknown"


@pytest.mark.parametrize("signal_text,signal", [
    ("show me my tasks", "list"),
    ("mark the bank task as done", "complete"),
    ("delete the bank task", "delete"),
])
def test_reconcile_overrides_model_deflection(signal_text, signal):
    # FIX 1: if the model deflects a clear action to unknown/create, the local
    # guardrail overrides it (keeping the model's query).
    model_said = nova_service.NovaIntent(intent="unknown", query="bank", source="claude")
    result = nova_service._reconcile(signal_text, model_said)
    assert result.intent == signal
    assert result.source == "claude"


def test_reconcile_keeps_model_intent_when_no_strong_signal():
    # No action keyword -> trust the model (create here).
    model_said = nova_service.NovaIntent(
        intent="create", title="Buy milk", description="...", source="claude"
    )
    result = nova_service._reconcile("buy some milk later", model_said)
    assert result.intent == "create"
    assert result.title == "Buy milk"


@pytest.mark.asyncio
async def test_nova_parse_endpoint_local(client, no_api_key):
    # Local parser path (no key) -> source == "local".
    r = await client.post("/api/v1/nova/parse", json={"text": "remind me to call the bank tomorrow"})
    assert r.status_code == 200
    draft = r.json()
    assert draft["source"] == "local"
    assert "call the bank" in draft["title"].lower()
    assert draft["description"]


@pytest.mark.asyncio
async def test_nova_parse_rejects_blank(client):
    r = await client.post("/api/v1/nova/parse", json={"text": "   "})
    assert r.status_code == 422


def _pending(op, cands):
    from app.schemas.nova import NovaPending, NovaPendingTask

    return NovaPending(op=op, candidates=[NovaPendingTask(**c) for c in cands])


def test_resolve_pending_yes_single_candidate():
    p = _pending("delete", [{"id": "a", "title": "Call the bank", "completed": False}])
    chosen = nova_service._resolve_pending("yes", p)
    assert chosen is not None and chosen.id == "a"


def test_resolve_pending_yes_ambiguous_returns_none():
    # "yes" with two candidates is ambiguous - must NOT guess.
    p = _pending(
        "delete",
        [
            {"id": "a", "title": "Call the bank", "completed": False},
            {"id": "b", "title": "Call the bank", "completed": True},
        ],
    )
    assert nova_service._resolve_pending("yes", p) is None


@pytest.mark.parametrize(
    "text",
    [
        "make it completed",
        "complete it",
        "mark it as done",
        "mark it complete",
        "yes complete it",
        "finish it",
        "go ahead",
        "do it",
        "make it so",
    ],
)
def test_resolve_pending_complete_confirmation_single_candidate(text):
    # The screenshot bug: a one-task COMPLETE card confirmed with a restated
    # action ("make it completed") must resolve to that task - not loop the card.
    # The task is ACTIVE, so the old status-word path (looking for a completed
    # candidate) found nothing and bailed.
    p = _pending("complete", [{"id": "a", "title": "Birthday Party Calls", "completed": False}])
    chosen = nova_service._resolve_pending(text, p)
    assert chosen is not None and chosen.id == "a"


@pytest.mark.parametrize(
    "text",
    ["delete it", "remove it", "yes delete it", "get rid of it"],
)
def test_resolve_pending_delete_confirmation_single_candidate(text):
    p = _pending("delete", [{"id": "a", "title": "Buy milk", "completed": False}])
    chosen = nova_service._resolve_pending(text, p)
    assert chosen is not None and chosen.id == "a"


def test_resolve_pending_conflicting_verb_does_not_hijack():
    # A "delete it" while a COMPLETE card is open must NOT confirm completion -
    # it isn't the pending op, so it falls through (re-classified upstream).
    p = _pending("complete", [{"id": "a", "title": "Birthday Party Calls", "completed": False}])
    assert nova_service._resolve_pending("delete it instead", p) is None


def test_resolve_pending_by_status():
    p = _pending(
        "delete",
        [
            {"id": "a", "title": "Call the bank", "completed": False},
            {"id": "b", "title": "Call the bank", "completed": True},
        ],
    )
    assert nova_service._resolve_pending("the completed one", p).id == "b"
    assert nova_service._resolve_pending("the not completed one", p).id == "a"


def test_resolve_pending_by_ordinal():
    p = _pending(
        "complete",
        [
            {"id": "a", "title": "Email Sam", "completed": False},
            {"id": "b", "title": "Email Dana", "completed": False},
        ],
    )
    assert nova_service._resolve_pending("the first one", p).id == "a"
    assert nova_service._resolve_pending("the second", p).id == "b"


def test_resolve_pending_by_title_word():
    p = _pending(
        "complete",
        [
            {"id": "a", "title": "Email Sam", "completed": False},
            {"id": "b", "title": "Call the bank", "completed": False},
        ],
    )
    assert nova_service._resolve_pending("the bank one", p).id == "b"


def test_history_to_messages_maps_roles_and_trims():
    from app.schemas.nova import NovaTurn

    history = [
        NovaTurn(role="agent", text="leading assistant turn"),  # dropped (leading)
        NovaTurn(role="user", text="show my tasks"),
        NovaTurn(role="agent", text=""),  # dropped (empty/card-only)
        NovaTurn(role="user", text="delete the bank one"),
    ]
    msgs = nova_service._history_to_messages(history)
    assert msgs[0]["role"] == "user"
    assert all(m["content"] for m in msgs)  # no empty turns
    assert [m["role"] for m in msgs] == ["user", "user"]


@pytest.mark.asyncio
async def test_nova_stream_resolves_pending_yes(client, no_api_key):
    # A "yes" with a single pending candidate emits a `resolve` event with the
    # task id - no re-classification, no draft card.
    body = {
        "text": "yes",
        "pending": {
            "op": "delete",
            "candidates": [{"id": "task-123", "title": "Call the bank", "completed": True}],
        },
    }
    r = await client.post("/api/v1/nova/stream", json=body)
    assert r.status_code == 200
    events = _parse_sse(r.text)
    resolve = next(data for name, data in events if name == "resolve")
    assert resolve == {"op": "delete", "task_id": "task-123"}


@pytest.mark.parametrize(
    "text",
    [
        "rename call the bank to call the credit union",
        "edit the groceries task",
        "change the bank task description to bring ID",
        "update the title of my workout task",
    ],
)
def test_local_classifier_catches_update(text):
    assert nova_service._classify_locally(text).intent == "update"


@pytest.mark.asyncio
async def test_nova_stream_create_confirm_via_pending(client, no_api_key):
    # A pending DRAFT confirmed by "add it" emits resolve {op: create, draft}.
    body = {
        "text": "yes add it",
        "pending": {
            "op": "create",
            "draft": {"title": "Call my friend", "description": "Talk about money", "source": "local"},
        },
    }
    r = await client.post("/api/v1/nova/stream", json=body)
    assert r.status_code == 200
    events = _parse_sse(r.text)
    resolve = next(data for name, data in events if name == "resolve")
    assert resolve["op"] == "create"
    assert resolve["draft"]["title"] == "Call my friend"
    # No draft card event - the task is being created, not re-drafted.
    assert "draft" not in [name for name, _ in events]


@pytest.mark.asyncio
async def test_plan_intent_emits_plan_card_with_tasks():
    # A `plan` intent emits a `plan` event carrying the extracted tasks (no draft
    # / meta). This is the fix: a planned week becomes addable tasks, not prose.
    from app.schemas.nova import NovaDraft

    intent = nova_service.NovaIntent(
        intent="plan",
        tasks=[
            NovaDraft(title="Start Nova demo outline", description="Monday", source="claude"),
            NovaDraft(title="Reply to top client emails", description="Monday", source="claude"),
        ],
        source="claude",
    )
    events = [e async for e in nova_service._trailing_events("yes go", intent)]
    assert len(events) == 1
    name, data = events[0]["event"], events[0]["data"]
    assert name == "plan"
    titles = [t["title"] for t in data["tasks"]]
    assert "Start Nova demo outline" in titles
    assert len(data["tasks"]) == 2


@pytest.mark.asyncio
async def test_nova_stream_create_many_confirm_via_pending(client, no_api_key):
    # A pending PLAN confirmed by "yes add them all" emits resolve
    # {op: create_many, drafts:[...]} - the whole plan is created at once.
    body = {
        "text": "yes add them all",
        "pending": {
            "op": "create_many",
            "drafts": [
                {"title": "Task one", "description": "d1", "source": "claude"},
                {"title": "Task two", "description": "d2", "source": "claude"},
            ],
        },
    }
    r = await client.post("/api/v1/nova/stream", json=body)
    assert r.status_code == 200
    events = _parse_sse(r.text)
    resolve = next(data for name, data in events if name == "resolve")
    assert resolve["op"] == "create_many"
    assert [d["title"] for d in resolve["drafts"]] == ["Task one", "Task two"]
    # No re-draft / re-plan card - the tasks are being created.
    names = [name for name, _ in events]
    assert "draft" not in names and "plan" not in names


@pytest.mark.asyncio
async def test_nova_stream_create_many_cancelled_when_not_yes(client, no_api_key):
    # Anything other than a confirmation does NOT create the plan - it falls
    # through to normal classification (no create_many resolve).
    body = {
        "text": "actually change the second one",
        "pending": {
            "op": "create_many",
            "drafts": [{"title": "Task one", "description": "d1", "source": "claude"}],
        },
    }
    r = await client.post("/api/v1/nova/stream", json=body)
    assert r.status_code == 200
    events = _parse_sse(r.text)
    resolves = [data for name, data in events if name == "resolve"]
    assert all(d.get("op") != "create_many" for d in resolves)


@pytest.mark.asyncio
async def test_nova_stream_delete_all_emits_meta(client, no_api_key):
    # "delete all my tasks" streams a reply then a meta {intent: delete_all}. No
    # draft, no per-task query - the client shows an are-you-sure card.
    r = await client.post("/api/v1/nova/stream", json={"text": "delete all my tasks"})
    assert r.status_code == 200
    events = _parse_sse(r.text)
    names = [name for name, _ in events]
    assert "draft" not in names
    assert names[-1] == "done"
    meta = next(data for name, data in events if name == "meta")
    assert meta["intent"] == "delete_all"


@pytest.mark.asyncio
async def test_nova_stream_delete_all_confirm_via_pending(client, no_api_key):
    # A pending delete_all confirmed by "yes" emits resolve {op: delete_all}.
    body = {"text": "yes", "pending": {"op": "delete_all"}}
    r = await client.post("/api/v1/nova/stream", json=body)
    assert r.status_code == 200
    events = _parse_sse(r.text)
    resolve = next(data for name, data in events if name == "resolve")
    assert resolve == {"op": "delete_all"}


@pytest.mark.asyncio
async def test_nova_stream_delete_all_cancelled_when_not_yes(client, no_api_key):
    # Anything other than a yes cancels the bulk delete - no resolve is emitted.
    body = {"text": "no wait", "pending": {"op": "delete_all"}}
    r = await client.post("/api/v1/nova/stream", json=body)
    assert r.status_code == 200
    events = _parse_sse(r.text)
    names = [name for name, _ in events]
    assert "resolve" not in names
    assert names[-1] == "done"


@pytest.mark.asyncio
async def test_nova_stream_update_emits_meta_with_new_values(client, no_api_key):
    # An update request emits meta carrying the new title/description. With no
    # key the local path leaves title/description empty, but the intent must be
    # update so the client can match and prompt.
    r = await client.post(
        "/api/v1/nova/stream",
        json={"text": "rename call the bank to call the credit union"},
    )
    assert r.status_code == 200
    events = _parse_sse(r.text)
    meta = next(data for name, data in events if name == "meta")
    assert meta["intent"] == "update"
    assert "intent" in meta and "query" in meta


def test_local_parser_strips_prefix_and_due():
    draft = nova_service._parse_locally("I need to prepare the slides by friday")
    assert draft.title == "Prepare the slides"
    assert "friday" in draft.description.lower()


def test_local_parser_truncates_long_title():
    long = "buy " + "x" * 100
    draft = nova_service._parse_locally(long)
    assert len(draft.title) <= 64
    assert draft.title.endswith("…")
