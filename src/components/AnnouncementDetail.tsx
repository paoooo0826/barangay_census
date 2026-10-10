import { useEffect, useState } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
export interface AnnouncementDetailData {
  id?: string;
  title: string;
  message: string;
  imageUrl?: string | null;
  image_path?: string | null;
  published_at?: string;
  priority?: string;
}
export function AnnouncementImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);
  if (!src || failed)
    return (
      <span
        role="status"
        className="flex min-h-24 items-center justify-center bg-slate-100 p-4 text-sm text-slate-500"
      >
        Attached image unavailable
      </span>
    );
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {!loaded && (
        <span className="sr-only" role="status">
          Loading image…
        </span>
      )}
    </>
  );
}
export default function AnnouncementDetail({
  announcement,
  onClose,
}: {
  announcement: AnnouncementDetailData;
  onClose: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(true, onClose, null),
    [full, setFull] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <article
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-detail-title"
        className={`max-h-[95dvh] w-full overflow-y-auto rounded-2xl bg-white p-5 sm:p-7 ${full ? "max-w-6xl" : "max-w-3xl"}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-pine-700">
              {announcement.priority ?? "Announcement"}
            </p>
            <h2
              id="announcement-detail-title"
              className="mt-2 break-words text-xl font-bold"
            >
              {announcement.title}
            </h2>
            {announcement.published_at && (
              <time className="mt-2 block text-xs text-slate-500">
                {new Date(announcement.published_at).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                })}
              </time>
            )}
          </div>
          <button
            type="button"
            aria-label="Close announcement"
            className="btn-secondary shrink-0"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {(announcement.imageUrl || announcement.image_path) && (
          <button
            type="button"
            aria-label="Open full announcement image"
            onClick={() => setFull((v) => !v)}
            className="mt-5 block w-full rounded-xl bg-slate-100"
          >
            <AnnouncementImage
              src={announcement.imageUrl}
              alt={`Attached image for ${announcement.title}`}
              className="max-h-[70dvh] w-full rounded-xl object-contain"
            />
          </button>
        )}
        <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
          {announcement.message}
        </p>
        <button type="button" onClick={onClose} className="btn-secondary mt-6">
          Close
        </button>
      </article>
    </div>
  );
}
