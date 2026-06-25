# Nova Task Agent - Frontend (React Native / Expo)

A React Native mobile app for managing personal tasks, with an **AI chat ("Nova")**
that turns plain text into structured tasks. Built with **Expo (SDK 54) · TypeScript ·
expo-router**, talking to the FastAPI backend in [`../backend`](../backend).

> Targets **Expo SDK 54** so it runs in the Expo Go app on devices that are on
> SDK 54. The Nova chat streams over SSE using `expo/fetch`, which is supported
> on SDK 52+.

## Features

- **Nova chat (home)** - describe a task in plain words; Nova (via the backend's
  Claude-powered endpoint) drafts a structured task you can add with one tap.
- **Task list** - search by title, filter by status (All / Active / Completed),
  toggle complete, pull-to-refresh, empty states for every situation.
- **Task details** - full view with created date and status; mark complete / delete.
- **Daily spark** - an inspirational quote fetched from a public API (with fallback).
- **Profile** - total / done / active stats.
- **Local persistence** - the task list is cached with AsyncStorage, so tasks show
  instantly on launch and remain visible offline.

All screens are functional components using hooks; shared state lives in a small
`TasksProvider` context.

---

## Setup

> Requires the backend running first - see [`../backend/README.md`](../backend/README.md).

```bash
cd frontend
npm install
npx expo start
```

Then:

- Press **`w`** to open in a web browser, **`a`** for Android, **`i`** for iOS, or
- Scan the QR code with **Expo Go** on a physical device.

### Pointing the app at the backend

A phone/emulator can't reach the dev machine via `localhost`, so the API base URL
is resolved automatically (see [src/constants/config.ts](src/constants/config.ts)):

1. **`EXPO_PUBLIC_API_URL`** env var, if set - wins always. e.g.
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.20:8000 npx expo start
   ```
2. **Web** → `http://localhost:8000`.
3. **Device / emulator** → derives the dev machine's LAN IP from the Expo dev
   server and targets port `8000` automatically.

If tasks don't load on a physical device, set `EXPO_PUBLIC_API_URL` to your
computer's LAN IP explicitly, and make sure the backend's `CORS_ORIGINS` allows it
(the default `["*"]` does).

---

## Project structure

```
frontend/src/
├── app/                       # expo-router routes (file-based)
│   ├── _layout.tsx            # root Stack + providers (TasksProvider, SafeArea)
│   ├── (tabs)/
│   │   ├── _layout.tsx        # Tabs with a custom dark tab bar
│   │   ├── index.tsx          # Nova chat
│   │   ├── tasks.tsx          # task list + search + filter
│   │   └── profile.tsx        # stats
│   └── task/[id].tsx          # task details (modal)
├── components/                # NovaMark, TaskCard, QuoteBanner, GradientButton, …
├── store/tasks.tsx            # TasksProvider - CRUD, optimistic updates, caching
├── lib/                       # api client, storage (AsyncStorage), formatters
├── constants/                 # theme tokens, config (API base URL)
└── types/                     # shared TypeScript types
```

## How it connects to the backend

- `lib/api.ts` wraps `fetch` with base-URL handling and error normalization.
- The Nova chat calls `POST /api/v1/nova/parse` → shows the draft card →
  `POST /api/v1/tasks` on "Add to my tasks".
- The task list/toggle/delete map to `GET/PATCH/DELETE /api/v1/tasks`.
- Mutations are optimistic (instant UI, rollback on failure) and written through
  to the AsyncStorage cache.

## Notes / trade-offs

- Icons are drawn with primitives + text glyphs to avoid a `react-native-svg`
  dependency, keeping setup minimal. The brand mark is a gradient + rotated bars.
- Search/filter run client-side over the cached list for instant feedback; the
  backend also supports `?q=` and `?status=` for server-side filtering.
- The design's auth/onboarding screens were out of scope for the task (no user
  accounts) and are omitted; the focus is the task-management core.
