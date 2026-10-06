import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCheck,
  FileText,
  Info,
  Loader2,
  X,
} from "lucide-react";

import { useDismissible } from "../hooks/useDismissible";
import { supabase } from "../lib/supabase";
import type {
  NotificationCategory,
  ResidentNotification,
} from "../types/database";

interface Props {
  residentId?: string | null;
  onOpenAppointments: () => void;
  onOpenRecord: () => void;
}

type NotificationFilter = "all" | NotificationCategory;

const FILTERS: Array<{ value: NotificationFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "appointment", label: "Appointments" },
  { value: "census", label: "Census" },
  { value: "system", label: "System" },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function NotificationIcon({ category }: { category: NotificationCategory }) {
  if (category === "appointment") return <CalendarDays size={17} />;
  if (category === "census") return <FileText size={17} />;
  return <Info size={17} />;
}

export default function ResidentNotifications({
  residentId,
  onOpenAppointments,
  onOpenRecord,
}: Props) {
  const [notifications, setNotifications] = useState<ResidentNotification[]>(
    [],
  );
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [open, setOpen] = useState(false);
  const panelRef = useDismissible<HTMLDivElement>(open, () => setOpen(false));
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!residentId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: notificationError } = await supabase
      .from("notifications")
      .select("*")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (notificationError) setError(notificationError.message);
    else setNotifications((data ?? []) as ResidentNotification[]);
    setLoading(false);
  }, [residentId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void loadNotifications(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications, open]);

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const visible = useMemo(
    () =>
      filter === "all"
        ? notifications
        : notifications.filter((item) => item.category === filter),
    [filter, notifications],
  );

  const markAllRead = async () => {
    const ids = notifications
      .filter((notification) => !notification.is_read)
      .map((notification) => notification.id);
    if (!ids.length) return;
    setMarking(true);
    setError(null);
    const { error: markError } = await supabase.rpc(
      "mark_resident_notifications_read",
      { p_notification_ids: ids },
    );
    setMarking(false);
    if (markError) {
      setError(markError.message);
      return;
    }
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, is_read: true })),
    );
  };

  const openRelatedPage = (notification: ResidentNotification) => {
    if (notification.category === "appointment") onOpenAppointments();
    else if (notification.category === "census") onOpenRecord();
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open notifications"
        aria-expanded={open}
        className={`icon-button relative ${open ? "border-pine-300 bg-pine-50 text-pine-700" : "border-slate-200 bg-white text-slate-600"}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-14 z-[80] max-h-[calc(100dvh-7rem)] w-[min(calc(100vw-3rem),24rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h2 className="font-bold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">
                Census and appointment updates
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.value}
                onClick={() => setFilter(item.value)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${filter === item.value ? "bg-pine-700 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="max-h-[50dvh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={18} /> Loading…
              </div>
            ) : visible.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-500">
                No notifications in this category.
              </p>
            ) : (
              visible.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => openRelatedPage(notification)}
                  className={`flex w-full gap-3 border-b border-slate-100 p-4 text-left hover:bg-pine-50 ${notification.is_read ? "bg-white" : "bg-pine-50/60"}`}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pine-100 text-pine-700">
                    <NotificationIcon category={notification.category} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">
                      {notification.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">
                      {notification.message}
                    </span>
                    <span className="mt-1.5 block text-[11px] text-slate-400">
                      {formatDateTime(notification.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 p-3">
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={marking || unreadCount === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {marking ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <CheckCheck size={15} />
              )}
              Mark all as read
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
