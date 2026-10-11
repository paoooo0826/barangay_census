import { useIdleSession } from "./hooks/useIdleSession";
import { useAppNavigation } from "./hooks/useAppNavigation";
import SessionWarning from "./components/SessionWarning";
import SessionTimer from "./components/SessionTimer";
import { useDialogFocus } from "./hooks/useDialogFocus";
import { navigateHash } from "./hooks/useHashRoute";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import { supabase } from "./lib/supabase";

import UserTypeSelection from "./pages/UserTypeSelection";
import ResidentAuth from "./pages/ResidentAuth";
import ResidentRegistration from "./pages/ResidentRegistration";
import CensusForm from "./pages/CensusForm";
import ResidentDashboard from "./pages/ResidentDashboard";
import ResetPassword from "./pages/ResetPassword";
import AdminAuth from "./pages/AdminAuth";
import AdminSetup from "./pages/AdminSetup";
import AdminDashboard from "./pages/AdminDashboard";
import AdminReview from "./pages/AdminReview";

function routePath(route: string) {
  return route.split("?")[0];
}

export default function App() {
  const {
    user,
    adminProfile,
    adminProfileError,
    loading,
    signOut,
    refreshAdminProfile,
  } = useAuth();
  const userId = user?.id;
  const isActiveAdmin = Boolean(
    adminProfile && adminProfile.is_active !== false,
  );
  const isPasswordReset =
    new URLSearchParams(window.location.search).get("password-reset") === "1";
  const [confirmLogout, setConfirmLogout] = useState(false);
  const handleLogout = useCallback(() => setConfirmLogout(true), []);
  const { route, navigate, goBack, registerNavigationGuard, clearHistory } =
    useAppNavigation(userId, loading, isActiveAdmin, handleLogout, isPasswordReset);
  const [sessionNotice, setSessionNotice] = useState(
    () => sessionStorage.getItem("barangay:session-notice") ?? "",
  );
  const logoutDialog = useDialogFocus<HTMLDivElement>(
    confirmLogout,
    () => setConfirmLogout(false),
    null,
  );
  const activeAdminRef = useRef(false);
  const logoutInFlight = useRef(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [authRedirecting, setAuthRedirecting] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [routeRetry, setRouteRetry] = useState(0);
  const [profileRetrying, setProfileRetrying] = useState(false);

  const path = routePath(route);
  const reviewMatch = path.match(/^\/admin\/review\/([^/]+)$/);
  const residentProtected =
    path === "/resident/register" ||
    path === "/resident/census" ||
    path === "/resident/dashboard";
  const adminProtected = path === "/admin/dashboard" || Boolean(reviewMatch);
  const loggedInOnLoginPage =
    Boolean(user) && (path === "/resident" || path === "/admin");
  const routeKey = `${userId ?? ""}:${path}`;
  const adminAccessError =
    Boolean(userId) && (path === "/admin" || adminProtected)
      ? adminProfileError
      : null;

  useEffect(() => {
    let active = true;
    if (loading || !userId || isPasswordReset) return;
    if (path === "/admin") {
      if (adminProfileError) return;
      navigateHash(
        isActiveAdmin ? "/admin/dashboard" : "/resident/dashboard",
        true,
      );
      return;
    }
    if (path !== "/resident" && path !== "/resident/register") return;
    const key = `${userId}:${path}`;
    setAuthRedirecting(key);
    setRouteError(null);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("residents")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (active)
          navigateHash(
            data ? "/resident/dashboard" : "/resident/register",
            true,
          );
      } catch {
        if (active)
          setRouteError({
            key,
            message:
              "Unable to check your census record. Check your connection and retry.",
          });
      } finally {
        if (active) setAuthRedirecting(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    isActiveAdmin,
    adminProfileError,
    isPasswordReset,
    loading,
    navigate,
    path,
    routeRetry,
    userId,
  ]);

  const performLogout = useCallback(async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutPending(true);
    setConfirmLogout(false);
    const portal = activeAdminRef.current ? "/admin" : "/resident";
    const pending: Promise<unknown>[] = [];
    window.dispatchEvent(
      new CustomEvent("barangay:flush-drafts", { detail: pending }),
    );
    await Promise.race([
      Promise.allSettled(pending),
      new Promise((resolve) => window.setTimeout(resolve, 2500)),
    ]);
    setLogoutError("");
    try {
      const { error } = await signOut();
      if (error) {
        setLogoutError(error.message || "Unable to sign out. Please try again.");
        return;
      }
      clearHistory();
      navigateHash(portal, true);
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
    } finally {
      logoutInFlight.current = false;
      setLogoutPending(false);
    }
  }, [signOut, clearHistory]);
  useEffect(() => {
    activeAdminRef.current = isActiveAdmin;
  }, [isActiveAdmin]);
  const expireSession = useCallback(async () => {
    setConfirmLogout(false);
    const portal = activeAdminRef.current ? "/admin" : "/resident";
    const message = "Your session expired due to inactivity";
    sessionStorage.setItem("barangay:session-notice", message);
    setSessionNotice(message);
    const pending: Promise<unknown>[] = [];
    window.dispatchEvent(
      new CustomEvent("barangay:flush-drafts", { detail: pending }),
    );
    await Promise.race([
      Promise.allSettled(pending),
      new Promise((resolve) => window.setTimeout(resolve, 2500)),
    ]);
    const result = await signOut();
    if (result.error) await supabase.auth.signOut({ scope: "local" });
    clearHistory();
    navigateHash(portal, true);
  }, [signOut, clearHistory]);
  const idle = useIdleSession(userId, expireSession);
  useEffect(() => {
    const expired = () => {
      const message = "Your authentication session has expired. Sign in again.";
      sessionStorage.setItem("barangay:session-notice", message);
      setSessionNotice(message);
      clearHistory();
      navigateHash(activeAdminRef.current ? "/admin" : "/resident", true);
    };
    window.addEventListener("barangay:authentication-expired", expired);
    return () =>
      window.removeEventListener("barangay:authentication-expired", expired);
  }, [clearHistory]);
  useEffect(() => {
    if (userId && !idle.expiring) {
      setSessionNotice("");
      sessionStorage.removeItem("barangay:session-notice");
    }
  }, [userId, idle.expiring]);
  let page: ReactNode;

  const accessError =
    adminAccessError ||
    (routeError?.key === routeKey ? routeError.message : null);
  if (accessError && !isPasswordReset && !loading) {
    page = (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm"
        >
          <h1 className="text-xl font-bold text-slate-900">
            Connection check needed
          </h1>
          <p className="mt-3 text-sm text-slate-600">{accessError}</p>
          <button
            type="button"
            disabled={profileRetrying}
            className="btn-primary mt-5"
            onClick={() => {
              if (!adminAccessError) {
                setRouteRetry((count) => count + 1);
                return;
              }
              setProfileRetrying(true);
              void refreshAdminProfile().finally(() =>
                setProfileRetrying(false),
              );
            }}
          >
            {profileRetrying ? "Checking…" : "Retry"}
          </button>
          <button
            type="button"
            className="btn-secondary ml-2 mt-5"
            onClick={() => navigate("/")}
          >
            Back to account selection
          </button>
        </div>
      </div>
    );
  } else if (
    (loading && (residentProtected || adminProtected)) ||
    authRedirecting === routeKey ||
    loggedInOnLoginPage
  ) {
    page = (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-pine-700" />
      </div>
    );
  } else if (residentProtected && !user) {
    page = (
      <ResidentAuth
        onBack={() => navigate("/")}
        onLoginSuccess={(destination) =>
          navigateHash(
            destination === "dashboard" && residentProtected
              ? route
              : destination === "dashboard"
                ? "/resident/dashboard"
                : "/resident/census",
            true,
          )
        }
        onRegisterClick={() => navigate("/resident/register")}
      />
    );
  } else if (adminProtected && (!user || !isActiveAdmin)) {
    page = (
      <AdminAuth
        onBack={() => navigate("/")}
        onLoginSuccess={() =>
          navigateHash(adminProtected ? route : "/admin/dashboard", true)
        }
      />
    );
  } else if (isPasswordReset) {
    page = (
      <ResetPassword
        onComplete={() => {
          window.history.replaceState(
            {},
            "",
            `${import.meta.env.BASE_URL}#/resident`,
          );
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        }}
      />
    );
  } else if (path === "/") {
    page = (
      <UserTypeSelection
        onResident={() => navigate("/resident")}
        onAdmin={() => navigate("/admin")}
      />
    );
  } else if (path === "/resident") {
    page = (
      <ResidentAuth
        onBack={() => navigate("/")}
        onLoginSuccess={(destination) =>
          navigateHash(
            destination === "dashboard" && residentProtected
              ? route
              : destination === "dashboard"
                ? "/resident/dashboard"
                : "/resident/census",
            true,
          )
        }
        onRegisterClick={() => navigate("/resident/register")}
      />
    );
  } else if (path === "/resident/register") {
    page = (
      <ResidentRegistration
        email=""
        onDashboard={() => navigate("/resident/census")}
        onBack={goBack}
      />
    );
  } else if (path === "/resident/census") {
    page = (
      <CensusForm
        onDashboard={() => navigate("/resident/dashboard")}
        onLogout={() => void handleLogout()}
        registerNavigationGuard={registerNavigationGuard}
      />
    );
  } else if (path === "/resident/dashboard") {
    page = (
      <ResidentDashboard
        tab={new URLSearchParams(route.split("?")[1] ?? "").get("tab")}
        onLogout={() => void handleLogout()}
        onEdit={() => navigate("/resident/census?mode=edit")}
      />
    );
  } else if (path === "/admin") {
    page = (
      <AdminAuth
        onBack={() => navigate("/")}
        onLoginSuccess={() =>
          navigateHash(adminProtected ? route : "/admin/dashboard", true)
        }
      />
    );
  } else if (path === "/admin/setup") {
    page = <AdminSetup onNavigate={navigate} />;
  } else if (path === "/admin/dashboard") {
    page = (
      <AdminDashboard
        tab={new URLSearchParams(route.split("?")[1] ?? "").get("tab")}
        onLogout={() => void handleLogout()}
        onReview={(id) => navigate(`/admin/review/${id}`)}
      />
    );
  } else if (reviewMatch) {
    page = (
      <AdminReview
        key={reviewMatch[1]}
        residentId={decodeURIComponent(reviewMatch[1])}
        onBack={goBack}
        onDecisionComplete={() => navigate("/admin/dashboard?tab=census")}
      />
    );
  } else {
    page = (
      <UserTypeSelection
        onResident={() => navigate("/resident")}
        onAdmin={() => navigate("/admin")}
      />
    );
  }

  return (
    <>
      {logoutError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[300] -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-lg"
        >
          {logoutError}
        </div>
      )}
      {sessionNotice && !user && (
        <p
          role="alert"
          className="fixed inset-x-3 top-3 z-[350] mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm font-semibold text-amber-900"
        >
          {sessionNotice}
        </p>
      )}
      <div
        hidden={(idle.expiring || logoutPending) && Boolean(user)}
        inert={(idle.expiring || logoutPending) && Boolean(user)}
        className={
          user && (residentProtected || adminProtected) ? "pb-20" : undefined
        }
      >
        {page}
      </div>
      {(idle.expiring || logoutPending) && user && (
        <div
          className="fixed inset-0 z-[450] flex items-center justify-center bg-slate-50"
          role="status"
        >
          {idle.expiring
            ? "Your session expired due to inactivity. Signing out…"
            : "Signing out…"}
        </div>
      )}
      {user &&
        !loading &&
        (residentProtected || adminProtected) &&
        !logoutPending &&
        !idle.expiring && (
          <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[45] flex items-end justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              className="pointer-events-auto rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-pine-800 shadow-sm"
              aria-label="Back to previous application page"
            >
              ← Back
            </button>
            {idle.secondsLeft !== null && (
              <SessionTimer seconds={idle.secondsLeft} />
            )}
          </div>
        )}
      {idle.remaining !== null && !idle.expiring && !logoutPending && (
        <SessionWarning
          seconds={idle.remaining}
          onStay={idle.stay}
          onLogout={() => {
            idle.stay();
            setConfirmLogout(true);
          }}
        />
      )}
      {confirmLogout && (
        <div
          className="fixed inset-0 z-[420] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmLogout(false);
          }}
        >
          <div
            ref={logoutDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            className="w-full max-w-md rounded-2xl bg-white p-6"
          >
            <h2 id="logout-title" className="text-xl font-bold">
              Are you sure you want to log out?
            </h2>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmLogout(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void performLogout()}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
