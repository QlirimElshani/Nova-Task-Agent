import AsyncStorage from '@react-native-async-storage/async-storage';

import type { User } from '@/types/auth';

const SESSION_KEY = 'nova.session.v1';
const ONBOARDING_KEY = 'nova.onboarding.done.v1';

type StoredSession = { token: string; user: User };

/** Persisted auth session + the one-time "onboarding seen" flag. */
export const session = {
  async load(): Promise<StoredSession | null> {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  },

  async save(data: StoredSession): Promise<void> {
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
      // Best-effort; staying signed in across launches is non-critical.
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  },

  async isOnboardingDone(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(ONBOARDING_KEY)) === '1';
    } catch {
      return false;
    }
  },

  async markOnboardingDone(): Promise<void> {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // ignore
    }
  },
};
