# Nova Task Agent - Backend (FastAPI)

REST API for the Nova Task Agent app. It provides task CRUD plus an **AI endpoint**
that turns a free-text message into a structured task draft, backed by
**Claude Opus 4.8** (with a local fallback so it runs without an API key).

Stack: **Python 3.11+ · FastAPI · SQLAlchemy 2 (async) · SQLite · Pydantic v2**, managed with **uv**.

> SQLite is used for zero-setup local dev. The async SQLAlchemy code is database-agnostic -
> to use Postgres, just point `DATABASE_URL` at `postgresql+asyncpg://…` (and add `asyncpg`).

---

## Quick start

```bash
cd backend
uv sync --extra dev          # install deps (or: make install)
cp .env.example .env         # optional - edit to add an Anthropic key
uv run uvicorn app.main:app --reload --port 8000 --app-dir src   # or: make dev
```

Then open:

- http://localhost:8000/health - health check (`nova_enabled` shows if a key is set)
- http://localhost:8000/docs - interactive Swagger UI (try every endpoint here)

The database file (`nova.db`) and tables are created automatically on first run.

## Tests

```bash
uv run pytest        # or: make test  → 17 passing
```

Tests run against an in-memory SQLite DB and the Nova local fallback (no API key needed).
One test (`test_no_fancy_dashes.py`) is a repo-wide style guard: it fails if any
em or en dash creeps into our source/docs (use a plain hyphen `-` instead). The
imported design mockup is exempt.

---

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./nova.db` | DB connection. Swap for Postgres in prod. |
| `ANTHROPIC_API_KEY` | _(empty)_ | Enables the real Claude call in `/nova/parse`. Empty → local parser. |
| `NOVA_MODEL` | `claude-sonnet-4-6` | Model used by the Nova endpoint. |
| `JWT_SECRET` | `dev-insecure-change-me` | Secret used to sign auth tokens. **Set a strong value in prod.** |
| `JWT_EXPIRE_MINUTES` | `10080` (7 days) | Access-token lifetime. |
| `CORS_ORIGINS` | `["*"]` | Allowed frontend origins (Expo dev server, web). |

---

## API

Base path: `/api/v1`. Full schema at `/docs`.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create an account. Body `{ name, email, password }` → `{ token, user }` (201). |
| `POST` | `/auth/login` | Body `{ email, password }` → `{ token, user }`. `401` on bad creds. |
| `POST` | `/auth/forgot-password` | Body `{ email }` → generic success message (no account enumeration). |
| `GET` | `/auth/me` | Current user. Requires `Authorization: Bearer <token>`. |

Passwords are hashed with **Argon2** (`pwdlib`); the access token is a **JWT** (`pyjwt`)
whose `sub` is the user id. Duplicate registration returns `409 CONFLICT`. There is no
email infrastructure, so `forgot-password` always returns success - it mirrors the app's
"check your inbox" screen without revealing which emails have accounts.

### Tasks

| Method | Path | Description |
|---|---|---|
| `GET` | `/tasks?q=&status=` | List tasks (newest first). `q` searches title; `status` ∈ `all`/`active`/`completed`. |
| `GET` | `/tasks/{id}` | Get one task. |
| `POST` | `/tasks` | Create a task. Body: `{ "title", "description?" }`. |
| `PATCH` | `/tasks/{id}` | Update title / description / `completed`. |
| `DELETE` | `/tasks/{id}` | Delete a task (204). |

A task: `{ id, title, description, completed, created_at, updated_at }` - covering the
spec's Title, Description, Status (`completed`), and Created date fields.

### Nova (AI)

| Method | Path | Description |
|---|---|---|
| `POST` | `/nova/parse` | One-shot. Body `{ "text" }` → `{ "title", "description", "source" }`. |
| `POST` | `/nova/stream` | Streaming (SSE). Body `{ "text" }` → a token-by-token reply, then a card event. |

`source` is `"claude"` when the model produced the draft, or `"local"` when the
rule-based fallback did (no API key, or the model call failed). With a key set,
the request goes to Claude Opus 4.8 using **structured outputs** so the response
is always valid JSON.

**`/nova/stream`** classifies the message into an intent and streams
Server-Sent Events. The reply text arrives as it is generated, then one card
event tells the client what to render:

- `delta` `{ "text" }` - one chunk of the running reply.
- `draft` `{ "title", "description", "source" }` - a new-task card (intent **create**).
- `meta` `{ "intent", "query" }` - intent **list** / **complete** / **delete**; the
  client matches `query` against the user's tasks and shows the list, a confirm
  card, or a pick list. Nothing is mutated server-side by this endpoint.
- `resolve` `{ "op", "task_id" }` - a short follow-up ("yes", "the first one")
  resolved a pending choice; the client runs `op` on that task directly.
- `error` `{ "message" }` - the model call failed; the reply degraded to local.
- `done` `{}` - the turn is finished.

Intent is decided by Claude (structured output) when a key is set, or a local
keyword classifier otherwise. A deterministic local guardrail overrides the
model when the message clearly means list / complete / delete, so a request like
"show my tasks" never silently becomes a chat reply.

**Conversation memory.** The agent is stateless; memory is the client re-sending
context with each turn. The request body may include `history` (recent
`{ role, text }` turns, replayed to the model so follow-ups like "delete it"
resolve to the right task) and `pending` (`{ op, candidates }` for a card still
awaiting a choice, so "yes" / "the completed one" / "the first one" resolve
against those candidates and emit a `resolve` event). Both are optional and
default to empty.

Example:

```bash
curl -X POST http://localhost:8000/api/v1/nova/parse \
  -H "Content-Type: application/json" \
  -d '{"text":"remind me to email the design feedback tomorrow"}'
# → {"title":"Email the design feedback","description":"Scheduled for tomorrow. ...","source":"local"}

curl -N -X POST http://localhost:8000/api/v1/nova/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"show me all my tasks"}'
# event: delta  data: {"text":"Here are the tasks you have right now."}
# event: meta   data: {"intent":"list","query":""}
# event: done   data: {}
```

### Errors

Validation failures return `422` with a consistent body:
`{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [...] } }`.
Missing resources return `404` with `code: "NOT_FOUND"`.

---

## Project structure

```
backend/src/app/
├── main.py              # app, CORS, /health, router mount, lifespan (create tables)
├── core/config.py       # env-driven settings
├── db/                  # SQLAlchemy Base + async engine/session
├── models/task.py       # Task ORM model
├── schemas/             # Pydantic request/response models (task, nova)
├── services/            # business logic - tasks_service, nova_service
└── api/v1/              # routers: tasks, nova  (+ deps, errors)
```

Layered: **router → service → model**. Routers parse/return; services hold logic and
DB access; models are the table shape. Services have no FastAPI imports, so they're
unit-testable without the HTTP layer.
