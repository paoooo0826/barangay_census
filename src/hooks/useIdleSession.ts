import { useCallback, useEffect, useRef, useState } from "react";
export const SESSION_TIMEOUT_MS = (() => {
  const n = Number(import.meta.env?.VITE_SESSION_TIMEOUT_MINUTES);
  return Number.isFinite(n) && n >= 1 ? n * 60_000 : 15 * 60_000;
})();
const WARNING_MS = 60_000;
export function activityKey(userId: string) {
  return `barangay:last-activity:${userId}`;
}
export function resetSessionActivity(userId: string) {
  try {
    localStorage.setItem(activityKey(userId), String(Date.now()));
    localStorage.removeItem(`barangay:expired:${userId}`);
  } catch {
    /* In-memory expiry still applies if browser storage is unavailable. */
  }
}
export function useIdleSession(
  userId: string | undefined,
  expire: () => Promise<void>,
  timeout = SESSION_TIMEOUT_MS,
) {
  const [remaining, setRemaining] = useState<number | null>(null),
    [expiring, setExpiring] = useState(false);
  const last = useRef(0),
    locked = useRef(false),
    warning = useRef(false),
    expireRef = useRef(expire);
  useEffect(() => {
    expireRef.current = expire;
  }, [expire]);
  const stay = useCallback(() => {
    if (!userId || locked.current) return;
    last.current = Date.now();
    resetSessionActivity(userId);
    warning.current = false;
    setRemaining(null);
  }, [userId]);
  useEffect(() => {
    setRemaining(null);
    setExpiring(false);
    locked.current = false;
    warning.current = false;
    if (!userId) return;
    const key = activityKey(userId),
      expiredKey = `barangay:expired:${userId}`;
    function read() {
      try {
        const value = Number(localStorage.getItem(key));
        return value > 0 ? value : 0;
      } catch {
        return 0;
      }
    }
    last.current = read() || Date.now();
    if (!read()) resetSessionActivity(userId);
    const end = () => {
      if (locked.current) return;
      locked.current = true;
      setExpiring(true);
      setRemaining(null);
      try {
        localStorage.setItem(expiredKey, String(Date.now()));
      } catch {
        /* local timeout remains active */
      }
      void expireRef.current();
    };
    const check = () => {
      if (locked.current) return;
      let expired = false;
      try {
        expired = !!localStorage.getItem(expiredKey);
      } catch {
        /* use memory */
      }
      last.current = Math.max(last.current, read());
      const left = timeout - (Date.now() - last.current);
      if (expired || left <= 0) {
        end();
        return;
      }
      warning.current = left <= Math.min(WARNING_MS, timeout);
      setRemaining(warning.current ? Math.ceil(left / 1000) : null);
    };
    const activity = () => {
      check();
      if (locked.current || warning.current) return;
      const now = Date.now();
      if (now - last.current < 1000) return;
      last.current = now;
      try {
        localStorage.setItem(key, String(now));
      } catch {
        /* use memory */
      }
    };
    const resume = () => {
      if (!document.hidden) check();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === key || e.key === expiredKey) check();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) =>
      window.addEventListener(e, activity, { passive: true }),
    );
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("storage", storage);
    const timer = window.setInterval(check, 1000);
    check();
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("storage", storage);
      window.clearInterval(timer);
    };
  }, [userId, timeout]);
  return { remaining, expiring, stay };
}
