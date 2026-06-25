import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Task } from '@/types/task';

const TASKS_KEY = 'nova.tasks.cache.v1';

/** Local cache of the task list, so tasks are available offline / instantly on launch. */
export const storage = {
  async loadTasks(): Promise<Task[] | null> {
    try {
      const raw = await AsyncStorage.getItem(TASKS_KEY);
      return raw ? (JSON.parse(raw) as Task[]) : null;
    } catch {
      return null;
    }
  },

  async saveTasks(tasks: Task[]): Promise<void> {
    try {
      await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    } catch {
      // Non-fatal: caching is best-effort.
    }
  },
};
