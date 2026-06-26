# Nova Task Agent

A personal task manager with an **AI chat ("Nova")** that turns plain-language
messages into structured tasks. A React Native (Expo) mobile app backed by a
FastAPI service that calls Claude.

| Part | Stack | Folder |
|---|---|---|
| Mobile app | React Native · Expo (SDK 54) · TypeScript · expo-router | [`frontend/`](frontend) |
| API | Python · FastAPI · SQLAlchemy (async) · SQLite · Claude Opus 4.8 | [`backend/`](backend) |
| Design | UI mockup that the app is built from | [`design/`](design) |

## What's implemented

The headline is the **Nova chat**: you manage your tasks by talking in plain
language, and the backend uses **Claude** (structured outputs) to understand the
request and reply, while the app shows an action card you confirm with one tap.

Nova chat - drive everything by conversation:
- **Create** a task from a sentence ("remind me to call the bank tomorrow").
- **Plan a week or month** - "plan my week" becomes a **multi-task plan spread
  across the days**, added all at once. Nova asks clarifying questions first, then
  breaks the goal into concrete per-day tasks.
- **List / search** ("show my active tasks"), **complete**, **delete**, **edit**
  ("rename Groceries to Weekly shop"), and **clear all** - each with a confirm card.
- **Disambiguation + memory** - when several tasks match, Nova asks which one;
  follow-ups ("yes", "the first one") resolve against the previous card. Recent
  turns are replayed so context carries within a conversation.
- **Saved chats** - conversations persist (FastAPI endpoints) and reopen from a
  side drawer. Replies stream token-by-token over SSE.
- Falls back to a **local parser/classifier** when no API key is set, so the whole
  flow runs offline too.

Auth & onboarding (from the design):
- **Splash** on every launch, **onboarding** (3 slides) shown once
- **Sign up / sign in / forgot password / log out**, backed by real FastAPI
  endpoints (Argon2-hashed passwords, JWT). Session persists across launches.
- Inline field validation + server-error handling, matching the mockup

Core (from the task spec):
- Task list screen, add / complete / delete, task details view
- Each task has Title, Description, Status (completed / not), Created date
- Input validation, clean dark UI, empty states
- Fetches a **public API** (an inspirational-quote "Daily spark" banner)

Bonus:
- **Search** tasks by title and **filter** by status (All / Active / Completed)
- **Local storage** of tasks (AsyncStorage cache - instant launch, offline view)
- **Navigation** between screens (tabs + a task-details modal)

## Run it

1. **Backend** (see [backend/README.md](backend/README.md)):
   ```bash
   cd backend
   uv sync --extra dev
   uv run uvicorn app.main:app --reload --port 8000 --app-dir src
   ```
   Optional: put an `ANTHROPIC_API_KEY` in `backend/.env` to enable the real
   Claude call (otherwise the Nova endpoint uses its local fallback).

2. **Frontend** (see [frontend/README.md](frontend/README.md)):
   ```bash
   cd frontend
   npm install
   npx expo start      # press w (web), a (Android), i (iOS), or scan with Expo Go
   ```

## Architecture

```
[Expo app]  ⇄  [FastAPI]  ⇄  SQLite
   fetch        Claude Opus 4.8 (Nova endpoint)
                ZenQuotes (public API, called directly from the app)
```

The backend follows a layered **router → service → model** structure; the app keeps
shared state in small context providers (tasks, auth, conversations) with optimistic
updates and an AsyncStorage cache. See each folder's README for details and trade-offs.

## Tests

- Backend: `cd backend && uv run pytest` (117 passing - task CRUD, search/filter,
  validation, Nova intents/local fallback, conversations, and auth:
  register/login/me/forgot).
- Frontend: `cd frontend && npx tsc --noEmit` typechecks; `npx expo export
  --platform web` bundles all routes.
