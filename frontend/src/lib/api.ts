import { fetch as expoFetch } from 'expo/fetch';

import { API_BASE_URL } from '@/constants/config';
import type { AuthResponse } from '@/types/auth';
import type { StatusFilter, Task, TaskDraft } from '@/types/task';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Bearer token attached to every authenticated request. Set on sign-in/restore,
// cleared on sign-out, by the auth store.
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

// A plain-language explanation for an HTTP status, used when the backend did not
// send a user-facing `error.message` of its own (e.g. a 502 from a proxy/gateway
// returns an HTML page, not our JSON error envelope). The goal is that the user
// always sees WHY something failed and what to do, never a bare code.
function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Something about that request was off. Please check your details and try again.';
    case 401:
      return 'Your email or password is incorrect.';
    case 403:
      return "You don't have access to do that.";
    case 404:
      return "We couldn't find what you were looking for.";
    case 409:
      return 'That already exists. Try a different value.';
    case 422:
      return 'Please double-check the information you entered.';
    case 429:
      return 'Too many attempts. Please wait a moment and try again.';
    case 500:
      return 'Something went wrong on our end. Please try again shortly.';
    case 502:
    case 503:
    case 504:
      return "Our server is waking up or temporarily unavailable. Please try again in a moment.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      "Can't reach the server. Check your connection and make sure the backend is running.",
      0,
    );
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Prefer a real, user-facing message from our backend's error envelope;
    // otherwise explain the failure from the status code rather than showing a
    // bare "Request failed (502)".
    const message = body?.error?.message ?? messageForStatus(res.status);
    throw new ApiError(message, res.status);
  }
  return body as T;
}

type TaskListResponse = { data: Task[]; total: number };

// --- Conversation history ---
// One stored turn. `role` mirrors the chat screen's message roles.
export type ChatMessage = { role: 'user' | 'agent'; text: string };

// A row in the history panel (no message bodies).
export type ConversationSummary = {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
};

// A full conversation, returned when (re)opening one.
export type ConversationDetail = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: (ChatMessage & { id: string; created_at: string })[];
};

export const api = {
  register(input: { name: string; email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  login(input: { email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  forgotPassword(email: string): Promise<{ message: string }> {
    return request<{ message: string }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  listTasks(params?: { q?: string; status?: StatusFilter }): Promise<TaskListResponse> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<TaskListResponse>(`/api/v1/tasks${suffix}`);
  },

  createTask(input: { title: string; description?: string }): Promise<Task> {
    return request<Task>('/api/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateTask(
    id: string,
    patch: Partial<Pick<Task, 'title' | 'description' | 'completed'>>,
  ): Promise<Task> {
    return request<Task>(`/api/v1/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteTask(id: string): Promise<void> {
    return request<void>(`/api/v1/tasks/${id}`, { method: 'DELETE' });
  },

  // Clear every task in one request (backs Nova's "delete all my tasks").
  deleteAllTasks(): Promise<void> {
    return request<void>('/api/v1/tasks', { method: 'DELETE' });
  },

  novaParse(text: string): Promise<TaskDraft> {
    return request<TaskDraft>('/api/v1/nova/parse', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // --- Conversation history (user-scoped, requires auth) ---
  listConversations(): Promise<ConversationSummary[]> {
    return request<ConversationSummary[]>('/api/v1/conversations');
  },

  getConversation(id: string): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/api/v1/conversations/${id}`);
  },

  createConversation(input: {
    title: string;
    messages?: ChatMessage[];
  }): Promise<ConversationDetail> {
    return request<ConversationDetail>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: input.title, messages: input.messages ?? [] }),
    });
  },

  appendMessages(id: string, messages: ChatMessage[]): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/api/v1/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messages }),
    });
  },

  deleteConversation(id: string): Promise<void> {
    return request<void>(`/api/v1/conversations/${id}`, { method: 'DELETE' });
  },

  novaStream(
    text: string,
    handlers: NovaStreamHandlers,
    options?: NovaStreamOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    return streamNova(text, handlers, options, signal);
  },
};

// ---------------------------------------------------------------------------
// Nova streaming (SSE). The backend emits named events: `delta` (a chunk of the
// reply), `draft` (the structured task card), `error` (friendly failure copy),
// and `done`. We consume the stream with expo/fetch, whose Response.body is a
// real ReadableStream in React Native (the standard global fetch is not).
// If streaming is unavailable or the connection fails, we fall back to the
// one-shot /parse endpoint so the chat still produces a task.
// ---------------------------------------------------------------------------

// What the backend decided the user wants, for non-create intents. The client
// uses `query` to find the target task(s) in its own task list. For `update`,
// `title`/`description` carry the proposed new values (either may be empty =
// unchanged).
export type NovaMeta = {
  intent: 'list' | 'complete' | 'delete' | 'delete_all' | 'update';
  query: string;
  title?: string;
  description?: string;
};

// A pending choice/confirmation was resolved by a follow-up ("yes" / "add it" /
// "the first one"). For complete/delete/update, run `op` on `task_id`. For
// create, the `draft` was confirmed - create it. For create_many, a whole plan
// was confirmed - create every task. For delete_all, the are-you-sure was
// confirmed - clear every task.
export type NovaResolve =
  | { op: 'complete' | 'delete' | 'update'; task_id: string }
  | { op: 'create'; draft: TaskDraft }
  | { op: 'create_many'; drafts: TaskDraft[] }
  | { op: 'delete_all' };

// One prior turn, replayed to the backend so Nova has conversational memory.
export type NovaTurn = { role: 'user' | 'agent'; text: string };

// A card still awaiting the user's choice/confirmation, sent so a short
// follow-up resolves against it instead of being classified from scratch.
export type NovaPending = {
  op: 'complete' | 'delete' | 'update' | 'create' | 'create_many' | 'delete_all';
  candidates?: { id: string; title: string; completed: boolean }[];
  draft?: TaskDraft; // only for op === 'create'
  drafts?: TaskDraft[]; // only for op === 'create_many'
};

export type NovaStreamOptions = {
  history?: NovaTurn[];
  pending?: NovaPending | null;
};

// Keep request history small but sufficient for follow-ups (matches the
// backend window). The most recent turns matter most.
export const NOVA_HISTORY_TURNS = 6;

export type NovaStreamHandlers = {
  onDelta: (chunk: string) => void;
  onDraft: (draft: TaskDraft) => void;
  onPlan?: (tasks: TaskDraft[]) => void;
  onMeta?: (meta: NovaMeta) => void;
  onResolve?: (resolve: NovaResolve) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
};

async function streamNova(
  text: string,
  handlers: NovaStreamHandlers,
  options?: NovaStreamOptions,
  signal?: AbortSignal,
): Promise<void> {
  const requestBody = JSON.stringify({
    text,
    history: options?.history ?? [],
    pending: options?.pending ?? null,
  });
  let res: Response;
  try {
    res = (await expoFetch(`${API_BASE_URL}/api/v1/nova/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: requestBody,
      signal,
    })) as unknown as Response;
  } catch {
    return novaFallback(text, handlers, signal);
  }

  if (!res.ok || !res.body) {
    return novaFallback(text, handlers, signal);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Process every complete frame
      // and keep the trailing partial in the buffer for the next read.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        dispatchFrame(frame, handlers);
      }
    }
  } catch {
    // Connection dropped mid-stream. If we never got a draft the consumer will
    // still be waiting, so degrade to the one-shot draft. onDone is called by
    // the caller's finally-style handling; here we just surface a draft.
    return novaFallback(text, handlers, signal, /* replyAlreadyShown */ true);
  }

  handlers.onDone?.();
}

function dispatchFrame(frame: string, handlers: NovaStreamHandlers): void {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;

  let data: unknown;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return;
  }

  switch (event) {
    case 'delta':
      handlers.onDelta((data as { text?: string }).text ?? '');
      break;
    case 'draft':
      handlers.onDraft(data as TaskDraft);
      break;
    case 'plan':
      handlers.onPlan?.((data as { tasks?: TaskDraft[] }).tasks ?? []);
      break;
    case 'meta':
      handlers.onMeta?.(data as NovaMeta);
      break;
    case 'resolve':
      handlers.onResolve?.(data as NovaResolve);
      break;
    case 'error':
      handlers.onError?.((data as { message?: string }).message ?? 'Something went wrong.');
      break;
    case 'done':
      // The reader loop calls onDone when the stream closes; nothing to do here.
      break;
  }
}

async function novaFallback(
  text: string,
  handlers: NovaStreamHandlers,
  signal?: AbortSignal,
  replyAlreadyShown = false,
): Promise<void> {
  if (signal?.aborted) return;
  if (!replyAlreadyShown) {
    handlers.onDelta("Here's a task I put together - want me to add it?");
  }
  let draft: TaskDraft;
  try {
    draft = await api.novaParse(text);
  } catch {
    draft = {
      title: text.length > 64 ? `${text.slice(0, 61)}…` : text,
      description: 'Captured from your message. Tap to add notes or edit anytime.',
      source: 'local',
    };
  }
  if (signal?.aborted) return;
  handlers.onDraft(draft);
  handlers.onDone?.();
}
