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
  const { user, adminProfile, loading, signOut } = useAuth();
  const [route, setRoute] = useState(currentRoute);
  const [logoutError, setLogoutError] = useState("");
  const [authRedirecting, setAuthRedirecting] = useState(false);

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

  useEffect(() => {
    let active = true;
    if (loading || !user || isPasswordReset) return;
    if (path === "/admin") {
      navigate(
        adminProfile?.is_active !== false && adminProfile
          ? "/admin/dashboard"
          : "/resident/dashboard",
      );
      return;
    }
    if (path !== "/resident" && path !== "/resident/register") return;
    if (adminProfile?.is_active !== false && adminProfile) {
      navigate("/admin/dashboard");
      return;
    }
    setAuthRedirecting(true);
    void (async () => {
      try {
        const { data } = await supabase
          .from("residents")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (active)
          navigate(data ? "/resident/dashboard" : "/resident/register");
      } finally {
        if (active) setAuthRedirecting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adminProfile, isPasswordReset, loading, navigate, path, user]);

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

  if (
    (loading && (residentProtected || adminProtected)) ||
    authRedirecting ||
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
  } else if (
    adminProtected &&
    (!user || !adminProfile || adminProfile.is_active === false)
  ) {
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
