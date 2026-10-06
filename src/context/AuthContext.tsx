import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AdminProfile } from "../types/database";

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
  adminProfileError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<AuthResult>;
  refreshAdminProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readAdminProfile(userId: string) {
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const PROFILE_ERROR =
  "Unable to check administrator access. Check your connection and retry.";

function clearAccountTemporaryData(userId?: string) {
  sessionStorage.removeItem("pendingResidentVerification");
  if (userId)
    sessionStorage.removeItem(`pendingResidentVerification:${userId}`);
  sessionStorage.removeItem("residentDashboardNotice");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<{
    userId: string | null | undefined;
    data: AdminProfile | null;
    error: string | null;
  }>({ userId: undefined, data: null, error: null });
  const profileRequest = useRef(0);
  const userId = session?.user.id ?? null;
  const loading = !sessionReady || profile.userId !== userId;
  const adminProfile = profile.userId === userId ? profile.data : null;
  const adminProfileError = profile.userId === userId ? profile.error : null;

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      receivedEvent = true;
      if (event === "SIGNED_OUT") clearAccountTemporaryData();
      setSession(nextSession);
      setSessionReady(true);
    });
    // A later auth event must win over a slower initial session lookup.
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || receivedEvent) return;
        setSession(error ? null : data.session);
        setSessionReady(true);
      })
      .catch(() => {
        if (active && !receivedEvent) {
          setSession(null);
          setSessionReady(true);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const request = ++profileRequest.current;
    let active = true;
    if (!userId) {
      setProfile({ userId: null, data: null, error: null });
      return;
    }
    // Outside the auth callback: no Auth lock re-entry, and token refresh
    // for the same account never replaces the protected page with a loader.
    void readAdminProfile(userId)
      .then((data) => {
        if (!active || request !== profileRequest.current) return;
        setProfile({ userId, data, error: null });
      })
      .catch(() => {
        if (!active || request !== profileRequest.current) return;
        setProfile({ userId, data: null, error: PROFILE_ERROR });
      });
    return () => {
      active = false;
      ++profileRequest.current;
    };
  }, [userId]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      return { error };
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}#/resident`,
        },
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
    },
    [],
  );

  const signOut = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      clearAccountTemporaryData(userId ?? undefined);
      setSession(null);
      setProfile({ userId: null, data: null, error: null });
    }
    return { error };
  }, [userId]);

  const refreshAdminProfile = useCallback(async () => {
    if (!userId) return;
    const request = ++profileRequest.current;
    try {
      const data = await readAdminProfile(userId);
      if (request === profileRequest.current)
        setProfile({ userId, data, error: null });
    } catch {
      if (request === profileRequest.current)
        setProfile((current) => ({ ...current, userId, error: PROFILE_ERROR }));
    }
  }, [userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      adminProfile,
      adminProfileError,
      loading,
      signIn,
      signUp,
      signOut,
      refreshAdminProfile,
    }),
    [
      session,
      adminProfile,
      adminProfileError,
      loading,
      signIn,
      signUp,
      signOut,
      refreshAdminProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
