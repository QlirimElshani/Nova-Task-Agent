import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api } from '@/lib/api';
import { storage } from '@/lib/storage';
import type { Task } from '@/types/task';

type TasksContextValue = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: { title: string; description?: string }) => Promise<Task | null>;
  // Create several tasks at once (backs Nova's "add all" for a plan). Returns
  // how many were created; prepends them in plan order with one cache write.
  createTasks: (
    inputs: { title: string; description?: string }[],
  ) => Promise<number>;
  toggleTask: (id: string) => Promise<void>;
  updateTask: (
    id: string,
    patch: { title?: string; description?: string },
  ) => Promise<Task | null>;
  deleteTask: (id: string) => Promise<void>;
  clearAllTasks: () => Promise<boolean>;
  getTask: (id: string) => Task | undefined;
};

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Persist to the local cache whenever the list changes (offline support).
  // Accepts a functional updater so callers never close over a stale `tasks`
  // snapshot (that previously dropped tasks under rapid create/update).
  const setAndCache = useCallback((update: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = update(prev);
      void storage.saveTasks(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listTasks();
      setAndCache(() => res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, [setAndCache]);

  // On launch: show cached tasks instantly, then refresh from the server.
  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await storage.loadTasks();
      if (active && cached) {
        setTasks(cached);
        setLoading(false);
      }
      await refresh();
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const createTask = useCallback(
    async (input: { title: string; description?: string }) => {
      try {
        const created = await api.createTask(input);
        // Functional update: prepend to the LATEST list, never a stale snapshot.
        setAndCache((prev) => [created, ...prev]);
        return created;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create task');
        return null;
      }
    },
    [setAndCache],
  );

  const createTasks = useCallback(
    async (inputs: { title: string; description?: string }[]) => {
      if (inputs.length === 0) return 0;
      // Create them concurrently but keep plan order in the result. A task that
      // fails to create is skipped (the rest still land), so a flaky request
      // doesn't sink the whole plan.
      const settled = await Promise.allSettled(inputs.map((i) => api.createTask(i)));
      const created: Task[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') created.push(r.value);
      }
      if (created.length === 0) {
        setError('Could not add the planned tasks');
        return 0;
      }
      if (created.length < inputs.length) {
        setError('Some planned tasks could not be added');
      }
      // Prepend newest-first (matching createTask) while preserving plan order
      // within the batch, in a single cache write.
      setAndCache((prev) => [...created.slice().reverse(), ...prev]);
      return created.length;
    },
    [setAndCache],
  );

  const toggleTask = useCallback(
    async (id: string) => {
      let nextCompleted: boolean | null = null;
      // Optimistic update derived from the latest list.
      setAndCache((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          nextCompleted = !t.completed;
          return { ...t, completed: nextCompleted };
        }),
      );
      if (nextCompleted === null) return; // id not found
      try {
        const updated = await api.updateTask(id, { completed: nextCompleted });
        setAndCache((prev) => prev.map((t) => (t.id === id ? updated : t)));
      } catch (e) {
        // Rollback just this task's flag.
        setAndCache((prev) =>
          prev.map((t) => (t.id === id ? { ...t, completed: !nextCompleted } : t)),
        );
        setError(e instanceof Error ? e.message : 'Could not update task');
      }
    },
    [setAndCache],
  );

  const updateTask = useCallback(
    async (id: string, patch: { title?: string; description?: string }) => {
      try {
        const updated = await api.updateTask(id, patch);
        setAndCache((prev) => prev.map((t) => (t.id === id ? updated : t)));
        return updated;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update task');
        return null;
      }
    },
    [setAndCache],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      let removed: Task | undefined;
      setAndCache((prev) => {
        removed = prev.find((t) => t.id === id);
        return prev.filter((t) => t.id !== id); // optimistic
      });
      try {
        await api.deleteTask(id);
      } catch (e) {
        if (removed) setAndCache((prev) => [removed as Task, ...prev]); // rollback
        setError(e instanceof Error ? e.message : 'Could not delete task');
      }
    },
    [setAndCache],
  );

  const clearAllTasks = useCallback(async () => {
    // Snapshot for rollback, then clear optimistically.
    let snapshot: Task[] = [];
    setAndCache((prev) => {
      snapshot = prev;
      return [];
    });
    try {
      await api.deleteAllTasks();
      return true;
    } catch (e) {
      setAndCache(() => snapshot); // rollback
      setError(e instanceof Error ? e.message : 'Could not clear tasks');
      return false;
    }
  }, [setAndCache]);

  const getTask = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);

  const value = useMemo(
    () => ({
      tasks,
      loading,
      error,
      refresh,
      createTask,
      createTasks,
      toggleTask,
      updateTask,
      deleteTask,
      clearAllTasks,
      getTask,
    }),
    [
      tasks,
      loading,
      error,
      refresh,
      createTask,
      createTasks,
      toggleTask,
      updateTask,
      deleteTask,
      clearAllTasks,
      getTask,
    ],
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within a TasksProvider');
  return ctx;
}
