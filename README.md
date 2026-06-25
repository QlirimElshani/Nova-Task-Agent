# Nova Task Agent

A personal task manager with an **AI chat ("Nova")** that turns plain-language
messages into structured tasks. A React Native (Expo) mobile app backed by a
FastAPI service that calls Claude.

| Part | Stack | Folder |
|---|---|---|
| Mobile app | React Native · Expo (SDK 56) · TypeScript · expo-router | [`frontend/`](frontend) |
| API | Python · FastAPI · SQLAlchemy (async) · SQLite · Claude Opus 4.8 | [`backend/`](backend) |
| Design | UI mockup that the app is built from | [`design/`](design) |

## What's implemented

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

Beyond the spec - the "Nova" concept from the design:
- A chat where you describe a task in plain words and the **backend uses
  Claude Opus 4.8** (structured outputs) to draft a `{title, description}`, which
  you add with one tap. Falls back to a local parser when no API key is set, so
  everything runs offline too.

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
shared task state in a single context with optimistic updates and an AsyncStorage
cache. See each folder's README for details and trade-offs.

## Tests

- Backend: `cd backend && uv run pytest` (16 passing - task CRUD, search/filter,
  validation, Nova local parser, and auth: register/login/me/forgot).
- Frontend: `cd frontend && npx tsc --noEmit` typechecks; `npx expo export
  --platform web` bundles all routes.
