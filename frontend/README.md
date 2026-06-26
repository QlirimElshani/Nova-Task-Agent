# Nova Task Agent - Frontend (React Native / Expo)

A React Native mobile app for managing personal tasks, with an **AI chat ("Nova")**
that turns plain text into structured tasks. Built with **Expo (SDK 54) · TypeScript ·
expo-router**, talking to the FastAPI backend in [`../backend`](../backend).

> Targets **Expo SDK 54** so it runs in the Expo Go app on devices that are on
> SDK 54. The Nova chat streams over SSE using `expo/fetch`, which is supported
> on SDK 52+.

## What we built

Nova Task Agent is a personal task manager you drive almost entirely **through
chat**. Instead of filling in forms, you talk to Nova in plain language and it does
the work - the backend uses **Claude** (with structured outputs) to understand what
you mean and reply, while the app shows an action card you confirm with one tap.

From the chat you can:

- **Create a task** - "remind me to call the bank tomorrow" → a drafted
  `{ title, description }` card you add with one tap.
- **Plan a week or a month** - "plan my week" or "plan a month of marathon
  training" → Nova **breaks the goal into a multi-task plan, spread across the
  days**, and you add the whole plan at once ("Add all"). Replying "yes" /
  "add them all" works too.
- **View / search your tasks** - "show my tasks", "what's still active?" → a list
  card rendered against your live tasks.
- **Complete, delete, or edit** - "mark the gym task done", "delete the bank one",
  "rename Groceries to Weekly shop". When several tasks match, Nova asks which one;
  follow-ups like "yes" or "the first one" resolve against the previous card.
- **Clear everything** - "delete all my tasks" → an are-you-sure confirm card.

Nova has **conversation memory** (recent turns are replayed so follow-ups resolve
correctly) and **saved chats** you can reopen from a side drawer. Everything also
works without an API key - the backend falls back to a local parser, so the app is
fully usable offline.

Alongside the chat there are classic screens too: a **Tasks** tab (list, search,
status filter, toggle, pull-to-refresh), a **task details** view, and a **Profile**
with stats. The app has real **auth** (sign up / sign in / forgot password, JWT
session that persists across launches) and a **Daily spark** quote from a public API.

## Features

- **Nova chat (home)** - the conversational hub: create, plan, list, complete,
  edit, and delete tasks in natural language; action cards confirm each step;
  streams the reply token-by-token over SSE.
- **Plans** - one message becomes a whole set of dated tasks added in a single tap.
- **Conversation history** - chats are saved and reopenable from a drawer; Nova
  remembers recent context within a conversation.
- **Task list** - search by title, filter by status (All / Active / Completed),
  toggle complete, pull-to-refresh, empty states for every situation.
- **Task details** - full view with created date and status; mark complete / delete.
- **Auth** - sign up / sign in / forgot password / log out, with a persisted session.
- **Daily spark** - an inspirational quote fetched from a public API (with fallback).
- **Profile** - total / done / active stats.
- **Local persistence** - the task list is cached with AsyncStorage, so tasks show
  instantly on launch and remain visible offline.

All screens are functional components using hooks; shared state lives in small
context providers (`TasksProvider`, auth, conversations).

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

### Running with ngrok (share over the internet)

Use ngrok when the device isn't on the same LAN (e.g. a remote tester, a phone on
cellular, or a corporate network that blocks peer-to-peer). The idea: expose the
**backend** through an ngrok tunnel and point the app at that public URL.

1. **Start the backend** as usual (see [`../backend/README.md`](../backend/README.md)),
   listening on port `8000`.

2. **Tunnel the backend** in a separate terminal:
   ```bash
   ngrok http 8000
   ```
   ngrok prints a public HTTPS URL, e.g. `https://abc123.ngrok-free.app`.

3. **Point the app at the tunnel** via the `EXPO_PUBLIC_API_URL` env var (it always
   wins over LAN-IP auto-detection - see [src/constants/config.ts](src/constants/config.ts)):
   ```bash
   EXPO_PUBLIC_API_URL=https://abc123.ngrok-free.app npx expo start
   ```
   On Windows PowerShell:
   ```powershell
   $env:EXPO_PUBLIC_API_URL="https://abc123.ngrok-free.app"; npx expo start
   ```

   > Use the **HTTPS** URL with **no trailing slash** and **no** `/api/v1` suffix -
   > the API client appends the path itself. (A trailing slash is trimmed anyway.)

4. **Reach the Expo dev server, too.** If your device also can't see the Metro
   bundler over the LAN, start Expo with its own tunnel:
   ```bash
   EXPO_PUBLIC_API_URL=https://abc123.ngrok-free.app npx expo start --tunnel
   ```
   (`--tunnel` may prompt to install `@expo/ngrok` the first time.)

**Things to change for ngrok**

- **Frontend:** only `EXPO_PUBLIC_API_URL`. Set it to the backend's ngrok HTTPS URL;
  no code edits are needed. Each `ngrok http 8000` restart gives a new URL on the
  free plan, so re-set the var (or use a [reserved/static domain](https://ngrok.com/docs/network-edge/domains-and-tcp-addresses/)).
- **Backend CORS:** the default `CORS_ORIGINS=["*"]` already allows the tunnel. If
  you've locked it down, add your ngrok URL to `CORS_ORIGINS` in the backend `.env`.
- **ngrok warning page (free plan):** the browser interstitial can break the first
  request. The app uses `fetch` (not a browser), so it's usually fine, but if you
  hit it you can send the `ngrok-skip-browser-warning` header from the API client,
  or upgrade the ngrok plan.
- **SSE / Nova streaming:** ngrok forwards Server-Sent Events fine, so `/nova/stream`
  works through the tunnel - just expect a little extra latency.

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
