import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useDismissible } from "../hooks/useDismissible";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/community";
import { paymentTime } from "../lib/payments";
import { navigateHash } from "../hooks/useHashRoute";
import PaginationControls from "./PaginationControls";
interface Event {
  id: string;
  category: string;
  entity_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}
interface Feed {
  items: Event[];
  unread_count: number;
  total: number;
}
export default function AdminNotifications() {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1),
    [unread, setUnread] = useState(false);
  const [feed, setFeed] = useState<Feed>({
      items: [],
      unread_count: 0,
      total: 0,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    lock = useRef(false);
  const panel = useDismissible<HTMLDivElement>(open, () => setOpen(false));
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const r = await supabase.rpc("admin_notification_feed", {
        p_offset: (page - 1) * 20,
        p_limit: 20,
        p_unread_only: unread,
      });
      if (request !== generation.current) return;
      if (r.error) {
        setError(r.error.message);
        return;
      }
      const value = r.data as unknown as Feed;
      if (!Array.isArray(value?.items))
        throw new Error("Notifications could not be loaded. Please retry.");
      if (page > 1 && (page - 1) * 20 >= value.total) {
        setPage(1);
        return;
      }
      setFeed(value);
      setError("");
    } catch (e) {
      if (request === generation.current) setError(errorMessage(e));
    }
  }, [page, unread]);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      ++generation.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  async function mark(ids: string[] | null) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      const r = await supabase.rpc("mark_admin_notifications_read", {
        p_notification_ids: ids,
      });
      if (r.error) throw r.error;
      await load();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function openItem(item: Event) {
    if (!item.is_read) await mark([item.id]);
    setOpen(false);
    const id = encodeURIComponent(item.entity_id);
    const destination =
      item.category === "census"
        ? `/admin/review/${id}`
        : item.category === "appointment"
          ? `/admin/dashboard?tab=appointments&appointment=${id}`
          : item.category === "landlord_message"
            ? `/admin/dashboard?tab=messages&house=${id}`
            : `/admin/dashboard?tab=${item.category === "incident" ? "incidents" : "feedback"}&item=${id}`;
    navigateHash(destination);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        className="icon-button relative"
        aria-label="Admin notifications"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
      >
        <Bell size={19} />
        {feed.unread_count > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs text-white">
            {feed.unread_count > 99 ? "99+" : feed.unread_count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-[80] max-h-[75dvh] w-[min(90vw,26rem)] overflow-y-auto rounded-2xl border bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              Admin Notifications ({feed.unread_count} Unread)
            </h2>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <label className="my-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unread}
              onChange={(e) => {
                setUnread(e.target.checked);
                setPage(1);
              }}
            />
            Unread Only
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy || !feed.unread_count}
            onClick={() => void mark(null)}
            className="mb-3 text-sm font-bold text-pine-700 underline disabled:opacity-40"
          >
            Mark All as Read
          </button>
          {feed.items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => void openItem(item)}
              className={`block w-full border-t p-3 text-left ${item.is_read ? "bg-white" : "bg-pine-50"}`}
            >
              <strong className="text-sm">{item.title}</strong>
              <span className="mt-1 block text-xs">{item.message}</span>
              <time className="mt-1 block text-xs text-slate-500">
                {paymentTime(item.created_at)} ·{" "}
                {item.is_read ? "Read" : "Unread"}
              </time>
            </button>
          ))}
          {!feed.items.length && (
            <p className="p-6 text-sm text-slate-500">No notifications yet.</p>
          )}
          <PaginationControls
            page={page}
            totalItems={feed.total}
            pageSize={20}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
