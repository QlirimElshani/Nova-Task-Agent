import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { api } from '@/lib/api';
import type { ChatMessage, ConversationDetail, ConversationSummary } from '@/lib/api';

type ConversationsContextValue = {
  summaries: ConversationSummary[];
  loading: boolean;
  /** id of the conversation currently open in the chat, or null for a fresh chat. */
  activeId: string | null;
  refresh: () => Promise<void>;
  /** Begin a fresh chat - the next turn creates a new conversation. */
  startNew: () => void;
  /**
   * Ensure a backing conversation exists for the current chat, creating one from
   * the first user message if needed. Returns its id (or null if creation failed).
   */
  ensureConversation: (firstUserText: string) => Promise<string | null>;
  /** Append one user+agent turn to a conversation and refresh the summaries. */
  recordTurn: (id: string, userText: string, agentText: string) => Promise<void>;
  /** Load a full conversation for reopening; also marks it active. */
  open: (id: string) => Promise<ConversationDetail | null>;
  /** Delete a conversation; clears activeId if it was the open one. */
  remove: (id: string) => Promise<void>;
};

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

// A conversation title is the first user message, trimmed to a tidy length.
function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || 'New chat';
}

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Read inside async callbacks without re-creating them on every change.
  const activeIdRef = useRef<string | null>(null);
  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSummaries(await api.listConversations());
    } catch {
      // Best-effort: an empty/last-known list is fine; the chat still works.
    } finally {
      setLoading(false);
    }
  }, []);

  const startNew = useCallback(() => setActive(null), [setActive]);

  const ensureConversation = useCallback(
    async (firstUserText: string) => {
      if (activeIdRef.current) return activeIdRef.current;
      try {
        const conv = await api.createConversation({ title: titleFrom(firstUserText) });
        setActive(conv.id);
        // Surface the new (empty) conversation at the top of the list right away.
        setSummaries((prev) => [
          { id: conv.id, title: conv.title, updated_at: conv.updated_at, message_count: 0 },
          ...prev,
        ]);
        return conv.id;
      } catch {
        return null;
      }
    },
    [setActive],
  );

  const recordTurn = useCallback(
    async (id: string, userText: string, agentText: string) => {
      const messages: ChatMessage[] = [{ role: 'user', text: userText }];
      if (agentText.trim()) messages.push({ role: 'agent', text: agentText });
      try {
        const conv = await api.appendMessages(id, messages);
        // Move this conversation to the top with its new count/timestamp.
        setSummaries((prev) => {
          const others = prev.filter((c) => c.id !== id);
          return [
            {
              id: conv.id,
              title: conv.title,
              updated_at: conv.updated_at,
              message_count: conv.messages.length,
            },
            ...others,
          ];
        });
      } catch {
        // Non-fatal: failing to persist a turn shouldn't break the live chat.
      }
    },
    [],
  );

  const open = useCallback(
    async (id: string) => {
      try {
        const conv = await api.getConversation(id);
        setActive(id);
        return conv;
      } catch {
        return null;
      }
    },
    [setActive],
  );

  const remove = useCallback(
    async (id: string) => {
      // Optimistic removal.
      const snapshot = summaries;
      setSummaries((prev) => prev.filter((c) => c.id !== id));
      if (activeIdRef.current === id) setActive(null);
      try {
        await api.deleteConversation(id);
      } catch {
        setSummaries(snapshot); // rollback
      }
    },
    [summaries, setActive],
  );

  const value = useMemo(
    () => ({
      summaries,
      loading,
      activeId,
      refresh,
      startNew,
      ensureConversation,
      recordTurn,
      open,
      remove,
    }),
    [summaries, loading, activeId, refresh, startNew, ensureConversation, recordTurn, open, remove],
  );

  return (
    <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>
  );
}

export function useConversations(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error('useConversations must be used within a ConversationsProvider');
  return ctx;
}
