import { useCallback, useEffect, useRef, useState } from "react";

function currentRoute() {
  const route = window.location.hash.slice(1) || "/";
  return route.startsWith("/") ? route : `/${route}`;
}

function historyIndex(): number | null {
  const index = window.history.state?.barangayIndex;
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function protectedPage(route: string, isAdmin: boolean) {
  const path = route.split("?")[0];
  return (
    /^\/resident\/(dashboard|census|register)$/.test(path) ||
    (isAdmin &&
      (path === "/admin/dashboard" || /^\/admin\/review\/[^/]+$/.test(path)))
  );
}

function savedPages() {
  const entries = window.history.state?.barangayPages;
  return new Map<number, string>(
    Array.isArray(entries)
      ? entries.filter(
          (entry) =>
            Array.isArray(entry) &&
            Number.isSafeInteger(entry[0]) &&
            entry[0] >= 0 &&
            typeof entry[1] === "string",
        )
      : [],
  );
}

/** Tracks same-document history, including Back to the start of a session. */
export function useAppNavigation(
  userId: string | undefined,
  loading: boolean,
  isAdmin: boolean,
  onLogoutRequest: () => void,
  passwordReset: boolean,
) {
  const [route, setRoute] = useState(currentRoute);
  const accepted = useRef(route);
  const index = useRef(historyIndex() ?? 0);
  const pages = useRef(savedPages());
  const guardedUser = useRef<string | null>(
    window.history.state?.barangayGuard ?? null,
  );
  const restoring = useRef<number | null>(null);
  const request = useRef(0);
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const session = useRef({ userId, loading, isAdmin, onLogoutRequest });

  useEffect(() => {
    if (
      !loading &&
      guardedUser.current &&
      guardedUser.current !== userId
    ) pages.current.clear();
    session.current = { userId, loading, isAdmin, onLogoutRequest };
  }, [userId, loading, isAdmin, onLogoutRequest]);

  const stateFor = useCallback((at: number, boundary = false) => ({
    ...window.history.state,
    barangayIndex: at,
    barangayGuard: guardedUser.current,
    barangayBoundary: boundary,
    // Route metadata only; no census data, tokens or drafts in browser history.
    barangayPages: [...pages.current.entries()].slice(-100),
  }), []);

  useEffect(() => {
    window.history.replaceState(stateFor(index.current), "");
    let recoveryTimer: number | undefined;
    const change = (event: Event) => {
      const destination = currentRoute();
      const next = historyIndex() ?? index.current + 1;
      if (restoring.current !== null) {
        if (next === restoring.current) restoring.current = null;
        else if (event.type === "popstate") {
          // A second fast Back can overtake the first history.go(). Recheck
          // the actual position after those browser events have settled.
          window.clearTimeout(recoveryTimer);
          recoveryTimer = window.setTimeout(() => {
            const target = restoring.current;
            const at = historyIndex();
            if (target !== null && at !== null && at !== target)
              window.history.go(target - at);
          }, 0);
        }
        return;
      }
      const auth = session.current;
      const backwards = next < index.current;
      const boundary =
        window.history.state?.barangayBoundary === true &&
        window.history.state?.barangayGuard === auth.userId;
      if (
        auth.userId &&
        !auth.loading &&
        protectedPage(accepted.current, auth.isAdmin) &&
        backwards &&
        (boundary || !protectedPage(destination, auth.isAdmin))
      ) {
        // Restore the existing protected entry, rather than adding entries on
        // every cancelled Back. The mounted page and its draft stay intact.
        ++request.current;
        restoring.current = index.current;
        window.history.go(index.current - next);
        auth.onLogoutRequest();
        return;
      }
      if (destination === accepted.current) {
        if (next !== index.current) {
          ++request.current;
          index.current = next;
          window.history.replaceState(stateFor(next), "");
        }
        return;
      }
      const pending = ++request.current;
      const previous = accepted.current;
      if (historyIndex() === null) {
        for (const at of pages.current.keys()) {
          if (at >= next) pages.current.delete(at);
        }
      }
      const record = (page: string) => {
        index.current = next;
        if (auth.userId && protectedPage(page, auth.isAdmin))
          pages.current.set(next, page);
        else pages.current.delete(next);
        window.history.replaceState(stateFor(next), "", `#${page}`);
      };
      const accept = () => {
        record(destination);
        accepted.current = destination;
        setRoute(destination);
      };
      if (!guard.current) {
        accept();
        return;
      }
      // Keep the current form mounted until its existing draft guard finishes.
      record(previous);
      void guard.current().then((allowed) => {
        if (pending === request.current && allowed) accept();
      });
    };
    // Same-URL boundary entries emit popstate without a hashchange.
    window.addEventListener("popstate", change);
    window.addEventListener("hashchange", change);
    return () => {
      window.removeEventListener("popstate", change);
      window.removeEventListener("hashchange", change);
      window.clearTimeout(recoveryTimer);
      ++request.current;
    };
  }, [stateFor]);

  useEffect(() => {
    if (
      !userId ||
      loading ||
      passwordReset ||
      !protectedPage(route, isAdmin) ||
      currentRoute() !== accepted.current
    ) return;
    if (guardedUser.current === userId) {
      pages.current.set(index.current, route);
      window.history.replaceState(stateFor(index.current), "");
      return;
    }
    // One sentinel per signed-in session also covers direct links. Persisting
    // this marker prevents duplicate sentinels when the page is refreshed.
    guardedUser.current = userId;
    pages.current.clear();
    window.history.replaceState(stateFor(index.current, true), "");
    ++index.current;
    pages.current.set(index.current, route);
    window.history.pushState(stateFor(index.current), "", `#${route}`);
  }, [userId, loading, isAdmin, passwordReset, route, stateFor]);

  const navigate = useCallback((destination: string) => {
    const normalized = destination.startsWith("/")
      ? destination
      : `/${destination}`;
    if (currentRoute() !== normalized) window.location.hash = normalized;
  }, []);

  const goBack = useCallback(() => {
    if (restoring.current !== null) return;
    const previous = [...pages.current.entries()]
      .filter(([at, page]) =>
        at < index.current &&
        page !== accepted.current &&
        protectedPage(page, session.current.isAdmin),
      )
      .sort((a, b) => b[0] - a[0])[0];
    if (previous) window.history.go(previous[0] - index.current);
    else session.current.onLogoutRequest();
  }, []);

  const registerNavigationGuard = useCallback(
    (callback: (() => Promise<boolean>) | null) => {
      guard.current = callback;
    },
    [],
  );
  const clearHistory = useCallback(() => {
    guard.current = null;
    pages.current.clear();
    guardedUser.current = null;
    restoring.current = null;
    ++request.current;
    window.history.replaceState(stateFor(index.current), "");
  }, [stateFor]);

  return { route, navigate, goBack, registerNavigationGuard, clearHistory };
}
