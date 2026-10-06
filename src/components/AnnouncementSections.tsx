import { useEffect, useState, type ReactNode } from "react";
import {
  isRecentAnnouncement,
  RECENT_ANNOUNCEMENT_DAYS,
} from "../lib/announcements";
import type { Announcement } from "../types/database";

export default function AnnouncementSections<T extends Announcement>({
  items,
  children,
  groupRecent = true,
  earlierLabel = "Earlier Announcements",
}: {
  items: T[];
  children: (announcement: T, recent: boolean) => ReactNode;
  groupRecent?: boolean;
  earlierLabel?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!groupRecent)
    return (
      <div className="space-y-4">
        {items.map((item) => children(item, false))}
      </div>
    );
  const recent: T[] = [];
  const earlier: T[] = [];
  for (const item of items)
    (isRecentAnnouncement(item, now) ? recent : earlier).push(item);
  return (
    <div className="space-y-6">
      {[
        { title: "Recent Announcements", rows: recent, recent: true },
        { title: earlierLabel, rows: earlier, recent: false },
      ].filter((group) => group.rows.length > 0).map((group) => (
        <section key={group.title} aria-label={group.title} className="space-y-4">
          <div className={`border-b pb-3 ${group.recent ? "border-pine-200" : "border-slate-200"}`}>
            <h3 className={`text-base font-bold ${group.recent ? "text-pine-800" : "text-slate-600"}`}>
              {group.title}
            </h3>
            {group.recent && (
              <p className="mt-1 text-xs text-slate-500">
                Published in the past {RECENT_ANNOUNCEMENT_DAYS} days
              </p>
            )}
          </div>
          {group.rows.map((item) => children(item, group.recent))}
        </section>
      ))}
    </div>
  );
}
