import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, setAuthToken } from '@/lib/api';
import { session } from '@/lib/session';
import type { User } from '@/types/auth';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  user: User | null;
  /** `null` until the persisted flag has been read on launch. */
  onboardingDone: boolean | null;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>;
  requestReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  // `null` = not yet read from storage; the splash waits for this to resolve
  // so a first-time user is never briefly routed past onboarding.
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Restore a persisted session (and onboarding flag) on launch.
  useEffect(() => {
    (async () => {
      const [stored, done] = await Promise.all([
        session.load(),
        session.isOnboardingDone(),
      ]);
      setOnboardingDone(done);
      if (stored) {
        setAuthToken(stored.token);
        setUser(stored.user);
        setStatus('signedIn');
      } else {
        setStatus('signedOut');
      }
    })();
  }, []);

  const persist = useCallback(async (token: string, nextUser: User) => {
    setAuthToken(token);
    setUser(nextUser);
    setStatus('signedIn');
    await session.save({ token, user: nextUser });
  }, []);

  // These let ApiError (whose message is the backend's user-facing string)
  // propagate; the calling screen turns it into displayed text.
  const signIn = useCallback<AuthContextValue['signIn']>(
    async (input) => {
      const res = await api.login(input);
      await persist(res.token, res.user);
    },
    [persist],
  );

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (input) => {
      const res = await api.register(input);
      await persist(res.token, res.user);
    },
    [persist],
  );

  const requestReset = useCallback<AuthContextValue['requestReset']>(async (email) => {
    await api.forgotPassword(email);
  }, []);

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    await session.clear();
  }, []);

  const completeOnboarding = useCallback<AuthContextValue['completeOnboarding']>(async () => {
    setOnboardingDone(true);
    await session.markOnboardingDone();
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      onboardingDone,
      signIn,
      signUp,
      requestReset,
      signOut,
      completeOnboarding,
    }),
    [status, user, onboardingDone, signIn, signUp, requestReset, signOut, completeOnboarding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
