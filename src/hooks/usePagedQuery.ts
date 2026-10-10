import { useCallback, useEffect, useRef, useState } from "react";

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}

export function usePagedQuery<T>({
  page,
  pageSize,
  onPageChange,
  query,
  enabled = true,
  refreshKey = 0,
}: {
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  query: (from: number, to: number) => PromiseLike<QueryResult<T>>;
  enabled?: boolean;
  refreshKey?: number;
}) {
  const request = useRef(0);
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const generation = ++request.current;
    setLoading(true);
    try {
      const result = await query((page - 1) * pageSize, page * pageSize - 1);
      if (generation !== request.current) return;
      if (result.error) throw result.error;
      const count = result.count ?? 0;
      setTotal(count);
      const finalPage = Math.max(1, Math.ceil(count / pageSize));
      if (page > finalPage) {
        onPageChange(finalPage);
        return;
      }
      setRows(result.data ?? []);
      setError(null);
    } catch (caught) {
      if (generation !== request.current) return;
      setError(
        caught && typeof caught === "object" && "message" in caught
          ? String(caught.message)
          : "Unable to load records.",
      );
      setRows([]);
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }, [enabled, page, pageSize, query, onPageChange]);
  useEffect(() => {
    void reload();
    if (!enabled) return;
    const refresh = () => {
      if (!document.hidden) void reload();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      ++request.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload, enabled, refreshKey]);
  return { rows, total, loading, error, reload };
}

// Escape LIKE wildcards and PostgREST filter punctuation instead of injecting
// raw search text into an or() filter expression.
export function searchPattern(value: string) {
  return `%${value.trim().replace(/[\\%_]/g, "\\$&")}%`;
}
