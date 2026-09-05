import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AdminProfile } from '../types/database';

interface AuthResult {
  error: AuthError | null;
}

interface SignUpResult extends AuthResult {
  data: { user: User | null };
  user: User | null;
  isExistingUser: boolean;
  needsEmailConfirmation: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  adminProfile: AdminProfile | null;
  loading: boolean;
  inactivitySecondsRemaining: number | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<AuthResult>;
  refreshAdminProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [inactivitySecondsRemaining, setInactivitySecondsRemaining] = useState<number | null>(null);

  const loadAdminProfile = async (userId: string | null) => {
    if (!userId) {
      setAdminProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('admin_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Unable to load admin profile:', error.message);
      setAdminProfile(null);
      return;
    }

    setAdminProfile(data);
  };

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadAdminProfile(data.session?.user.id ?? null);
      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadAdminProfile(nextSession?.user.id ?? null).finally(() => {
        if (active) setLoading(false);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (!session?.user) {
      setInactivitySecondsRemaining(null);
      return;
    }

    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;
    const LAST_ACTIVITY_KEY = 'barangay-census-last-activity';
    let lastRecordedActivity = 0;
    let loggingOut = false;

    const recordActivity = () => {
      const now = Date.now();

      // Avoid writing to localStorage for every mouse movement.
      if (now - lastRecordedActivity < 1000) return;

      lastRecordedActivity = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    };

    const getLastActivity = () => {
      const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
      return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
    };

    const logoutForInactivity = async () => {
      if (loggingOut) return;
      loggingOut = true;
      localStorage.removeItem(LAST_ACTIVITY_KEY);

      try {
        await supabase.auth.signOut();
      } finally {
        setSession(null);
        setAdminProfile(null);
        setInactivitySecondsRemaining(null);
        window.location.replace(`${import.meta.env.BASE_URL}#/?reason=inactive`);
      }
    };

    const checkInactivity = () => {
      const elapsed = Date.now() - getLastActivity();
      const remaining = Math.max(0, INACTIVITY_LIMIT_MS - elapsed);
      setInactivitySecondsRemaining(Math.ceil(remaining / 1000));

      if (remaining <= 0) {
        void logoutForInactivity();
      }
    };

    recordActivity();
    checkInactivity();

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - getLastActivity();
        if (elapsed >= INACTIVITY_LIMIT_MS) {
          void logoutForInactivity();
          return;
        }
        recordActivity();
        checkInactivity();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) checkInactivity();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);
    const intervalId = window.setInterval(checkInactivity, 1000);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(intervalId);
    };
  }, [session?.user?.id]);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
  ): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    const isExistingUser = Boolean(
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0,
    );

    return {
      data: { user: data.user },
      user: data.user,
      error,
      isExistingUser,
      needsEmailConfirmation: Boolean(
        data.user && !data.session && !isExistingUser,
      ),
    };
  };

  const signOut = async (): Promise<AuthResult> => {
    localStorage.removeItem('barangay-census-last-activity');
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setSession(null);
      setAdminProfile(null);
    }
    return { error };
  };

  const refreshAdminProfile = async () => {
    await loadAdminProfile(session?.user.id ?? null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      adminProfile,
      loading,
      inactivitySecondsRemaining,
      signIn,
      signUp,
      signOut,
      refreshAdminProfile,
    }),
    [session, adminProfile, loading, inactivitySecondsRemaining],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
