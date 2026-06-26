# Nova Task Agent

A personal task manager with an **AI chat ("Nova")** that turns plain-language
messages into structured tasks. A React Native (Expo) mobile app backed by a
FastAPI service that calls Claude.

| Part | Stack | Folder |
|---|---|---|
| Mobile app | React Native · Expo (SDK 54) · TypeScript · expo-router | [`frontend/`](frontend) |
| API | Python · FastAPI · SQLAlchemy (async) · SQLite · Claude (Sonnet 4.6) | [`backend/`](backend) |

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

Auth & onboarding:
- **Splash** on every launch, **onboarding** (3 slides) shown once
- **Sign up / sign in / forgot password / log out**, backed by real FastAPI
  endpoints (Argon2-hashed passwords, JWT). Session persists across launches.
- Inline field validation + server-error handling

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

### Run it over the internet with ngrok

On the same Wi-Fi the app finds the backend automatically (it derives your dev
machine's LAN IP). When the device isn't on the same network - a remote tester, a
phone on cellular, a locked-down work network - expose the **backend** through an
ngrok tunnel and point the app at that public URL.

1. Start the backend as above (port `8000`).
2. Tunnel it in another terminal: `ngrok http 8000`. ngrok prints a public HTTPS
   URL like `https://abc123.ngrok-free.app`.
3. Start the app pointed at that URL via `EXPO_PUBLIC_API_URL` (it overrides the
   LAN auto-detection):
   ```bash
   EXPO_PUBLIC_API_URL=https://abc123.ngrok-free.app npx expo start
   ```
   PowerShell: `$env:EXPO_PUBLIC_API_URL="https://abc123.ngrok-free.app"; npx expo start`
   Add `--tunnel` if the device also can't reach the Metro bundler over the LAN.

**What to change:** only `EXPO_PUBLIC_API_URL` (the backend's ngrok HTTPS URL, no
trailing slash, no `/api/v1` suffix) - no code edits. The free plan gives a new URL
on each restart, so re-set it (or reserve a static domain). The backend's default
`CORS_ORIGINS=["*"]` already allows the tunnel; SSE/Nova streaming works through it.
Full details (the ngrok warning page, CORS lockdown) are in
[frontend/README.md](frontend/README.md#running-with-ngrok-share-over-the-internet).

## Architecture

```
[Expo app]  ⇄  [FastAPI]  ⇄  SQLite
   fetch        Claude Sonnet 4.6 (Nova endpoint)
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
