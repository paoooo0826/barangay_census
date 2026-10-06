import { useCallback, useEffect, useState } from "react";
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

function currentRoute() {
  const hash = window.location.hash.slice(1);
  const route = hash || "/";
  return route.startsWith("/") ? route : `/${route}`;
}

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
  const [route, setRoute] = useState(currentRoute);
  const [logoutError, setLogoutError] = useState("");
  const [authRedirecting, setAuthRedirecting] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [routeRetry, setRouteRetry] = useState(0);
  const [profileRetrying, setProfileRetrying] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", handleRouteChange);
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);

  const navigate = useCallback((destination: string) => {
    const normalized = destination.startsWith("/")
      ? destination
      : `/${destination}`;

    if (currentRoute() === normalized) return;
    window.location.hash = normalized;
  }, []);

  const path = routePath(route);
  const reviewMatch = path.match(/^\/admin\/review\/([^/]+)$/);
  const isPasswordReset =
    new URLSearchParams(window.location.search).get("password-reset") === "1";
  const residentProtected =
    path === "/resident/register" ||
    path === "/resident/census" ||
    path === "/resident/dashboard";
  const adminProtected = path === "/admin/dashboard" || Boolean(reviewMatch);
  const loggedInOnLoginPage =
    Boolean(user) && (path === "/resident" || path === "/admin");
  const isActiveAdmin = Boolean(
    adminProfile && adminProfile.is_active !== false,
  );
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
      navigate(isActiveAdmin ? "/admin/dashboard" : "/resident/dashboard");
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
          navigate(data ? "/resident/dashboard" : "/resident/register");
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

  const handleLogout = useCallback(async () => {
    setLogoutError("");
    const { error } = await signOut();
    if (error) {
      setLogoutError(error.message || "Unable to sign out. Please try again.");
      return;
    }
    navigate("/");
  }, [navigate, signOut]);

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
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  } else if (residentProtected && !user) {
    page = (
      <ResidentAuth
        onBack={() => navigate("/")}
        onLoginSuccess={(destination) =>
          navigate(
            destination === "dashboard"
              ? "/resident/dashboard"
              : "/resident/census",
          )
        }
        onRegisterClick={() => navigate("/resident/register")}
      />
    );
  } else if (adminProtected && (!user || !isActiveAdmin)) {
    page = (
      <AdminAuth
        onBack={() => navigate("/")}
        onLoginSuccess={() => navigate("/admin/dashboard")}
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
          setRoute("/resident");
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
          navigate(
            destination === "dashboard"
              ? "/resident/dashboard"
              : "/resident/census",
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
        onBack={() => navigate("/resident")}
      />
    );
  } else if (path === "/resident/census") {
    page = (
      <CensusForm
        onDashboard={() => navigate("/resident/dashboard")}
        onLogout={() => void handleLogout()}
      />
    );
  } else if (path === "/resident/dashboard") {
    page = (
      <ResidentDashboard
        onLogout={() => void handleLogout()}
        onEdit={() => navigate("/resident/census?mode=edit")}
      />
    );
  } else if (path === "/admin") {
    page = (
      <AdminAuth
        onBack={() => navigate("/")}
        onLoginSuccess={() => navigate("/admin/dashboard")}
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
        residentId={decodeURIComponent(reviewMatch[1])}
        onBack={() => navigate("/admin/dashboard?tab=census")}
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
      {page}
    </>
  );
}
