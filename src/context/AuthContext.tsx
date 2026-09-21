import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<AuthResult>;
  refreshAdminProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function clearAccountTemporaryData(userId?: string) {
  sessionStorage.removeItem("pendingResidentVerification");
  if (userId)
    sessionStorage.removeItem(`pendingResidentVerification:${userId}`);
  sessionStorage.removeItem("residentDashboardNotice");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAdminProfile = async (userId: string | null) => {
    if (!userId) {
      setAdminProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Unable to load admin profile:", error.message);
      setAdminProfile(null);
      return;
    }

    setAdminProfile(data);
  };

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      const nextSession = error ? null : data.session;
      setSession(nextSession);
      await loadAdminProfile(nextSession?.user.id ?? null);
      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") clearAccountTemporaryData();
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

  const signIn = async (
    email: string,
    password: string,
  ): Promise<AuthResult> => {
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
  };

  const signOut = async (): Promise<AuthResult> => {
    const userId = session?.user.id;
    const { error } = await supabase.auth.signOut();
    if (!error) {
      clearAccountTemporaryData(userId);
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
      signIn,
      signUp,
      signOut,
      refreshAdminProfile,
    }),
    [session, adminProfile, loading],
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
