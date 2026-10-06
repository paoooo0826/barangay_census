import type { Announcement } from "../types/database";

export const RECENT_ANNOUNCEMENT_DAYS = 7;
type AnnouncementTiming = Pick<
  Announcement,
  "published_at" | "is_published" | "archived" | "expires_at"
>;

export function isRecentAnnouncement(
  announcement: AnnouncementTiming,
  now = Date.now(),
) {
  if (
    !announcement.is_published ||
    announcement.archived ||
    !announcement.published_at
  )
    return false;
  const published = Date.parse(announcement.published_at);
  const expires = announcement.expires_at
    ? Date.parse(announcement.expires_at)
    : null;
  return (
    Number.isFinite(published) &&
    published <= now &&
    now - published < RECENT_ANNOUNCEMENT_DAYS * 86_400_000 &&
    (expires === null || (Number.isFinite(expires) && expires > now))
  );
}
