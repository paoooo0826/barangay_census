import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  BellRing,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Megaphone,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import SortControls from "./SortControls";
import PaginationControls from "./PaginationControls";
import { usePagedQuery } from "../hooks/usePagedQuery";
import { type SortDirection } from "../lib/sorting";
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementPriority,
} from "../types/database";

interface Props {
  adminProfileId?: string;
  refreshKey?: number;
}
type AnnouncementView = Announcement & { imageUrl?: string | null };
type AnnouncementTab = "active" | "archived";
type FieldErrors = Partial<
  Record<"title" | "message" | "priority" | "audience" | "expiresAt", string>
>;

const PAGE_SIZE = 6;
const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: "All residents",
  pending_review: "Pending review residents",
  verified: "Verified residents",
  returned: "Residents with returned records",
  rejected: "Residents with rejected records",
};
const ACTIVE_AUDIENCES: AnnouncementAudience[] = [
  "all",
  "pending_review",
  "verified",
  "rejected",
];
const PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  info: "Information",
  important: "Important",
  urgent: "Urgent",
};
const PRIORITY_STYLES: Record<AnnouncementPriority, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  important: "border-amber-200 bg-amber-50 text-amber-800",
  urgent: "border-red-200 bg-red-50 text-red-800",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

async function cropToBanner(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Announcement photo must be JPG, PNG, or WebP.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Announcement photo must be 5 MB or smaller.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("The selected announcement image could not be read."));
      element.src = url;
    });
    const ratio = 16 / 7;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    if (sourceRatio > ratio) {
      sw = image.naturalHeight * ratio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / ratio;
      sy = (image.naturalHeight - sh) / 2;
    }
    const width = Math.min(1600, Math.max(800, Math.round(sw)));
    const height = Math.round(width / ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("This browser cannot crop the announcement image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value && value.size > 0
            ? resolve(value)
            : reject(new Error("The cropped image is empty.")),
        "image/jpeg",
        0.9,
      ),
    );
    return new File([blob], `announcement-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AdminAnnouncements({
  adminProfileId,
  refreshKey,
}: Props) {
  const mutationLock = useRef(false);
  const imageGeneration = useRef(0);
  const [preparingImage, setPreparingImage] = useState(false);
  const [editing, setEditing] = useState<AnnouncementView | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementView[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<AnnouncementPriority>("info");
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [expiresAt, setExpiresAt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(
    () =>
      new URLSearchParams(window.location.hash.split("?")[1] ?? "").get(
        "new",
      ) === "1",
  );
  const [tab, setTab] = useState<AnnouncementTab>("active");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [previewImage, setPreviewImage] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const [counts, setCounts] = useState({ active: 0, archived: 0 });
  const imageRequest = useRef(0);
  const announcementQuery = useCallback(
    (from: number, to: number) => {
      const column =
        sortField === "priority"
          ? "priority_label"
          : sortField === "audience"
            ? "audience_label"
            : sortField === "created_at" && tab === "archived"
              ? "archive_sort"
              : sortField;
      return supabase
        .from("admin_announcement_list")
        .select("*", { count: "exact" })
        .eq("archived", tab === "archived")
        .order(column, {
          ascending: sortDirection === "asc",
          nullsFirst: false,
        })
        .order("id")
        .range(from, to);
    },
    [sortField, sortDirection, tab],
  );
  const {
    rows,
    total,
    loading,
    error: queryError,
    reload,
  } = usePagedQuery<Announcement>({
    page,
    pageSize: PAGE_SIZE,
    onPageChange: setPage,
    query: announcementQuery,
    refreshKey,
  });
  const loadCounts = useCallback(async () => {
    const [active, archived] = await Promise.all([
      supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("archived", false),
      supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("archived", true),
    ]);
    if (!active.error && !archived.error)
      setCounts({ active: active.count ?? 0, archived: archived.count ?? 0 });
  }, []);
  const loadAnnouncements = useCallback(async () => {
    await Promise.all([reload(), loadCounts()]);
  }, [reload, loadCounts]);
  useEffect(() => {
    void loadCounts();
  }, [loadCounts, total, refreshKey]);
  useEffect(() => {
    const generation = ++imageRequest.current;
    setAnnouncements(rows.map((row) => ({ ...row, imageUrl: null })));
    void Promise.all(
      rows.map(async (row) => {
        if (!row.image_path) return { ...row, imageUrl: null };
        const { data, error: e } = await supabase.storage
          .from("announcement-images")
          .createSignedUrl(row.image_path, 3600);
        return { ...row, imageUrl: e ? null : (data?.signedUrl ?? null) };
      }),
    ).then((withImages) => {
      if (generation === imageRequest.current) setAnnouncements(withImages);
    });
    return () => {
      ++imageRequest.current;
    };
  }, [rows]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setCurrentTime(Date.now()),
      60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setPage(1);
  }, [sortField, sortDirection, tab]);
  useEffect(
    () => () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );

  const visible = announcements;

  async function chooseImage(file?: File) {
    if (!file) return;
    const generation = ++imageGeneration.current;
    setPreparingImage(true);
    try {
      const cropped = await cropToBanner(file);
      if (generation !== imageGeneration.current) return;
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImage(cropped);
      setRemoveExistingImage(false);
      setImagePreview(URL.createObjectURL(cropped));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to prepare announcement image.",
      );
    } finally {
      if (generation === imageGeneration.current) setPreparingImage(false);
    }
  }
  function clearImage() {
    imageGeneration.current += 1;
    setPreparingImage(false);
    setRemoveExistingImage(true);
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview("");
  }
  function validate() {
    const next: FieldErrors = {};
    if (title.trim().length < 3)
      next.title = "Enter an announcement title with at least 3 characters.";
    if (message.trim().length < 5)
      next.message = "Enter a complete announcement message.";
    if (!priority) next.priority = "Select a priority.";
    if (!audience) next.audience = "Select an audience.";
    if (
      expiresAt &&
      new Date(expiresAt).getTime() <= currentTime &&
      (!editing?.expires_at ||
        Math.abs(
          new Date(expiresAt).getTime() -
            new Date(editing.expires_at).getTime(),
        ) >= 60_000)
    )
      next.expiresAt = "Expiration must be a future date and time.";
    setFieldErrors(next);
    if (Object.keys(next).length) {
      setError("Complete the required announcement fields highlighted in red.");
      return false;
    }
    return true;
  }

  function resetForm() {
    setTitle("");
    setMessage("");
    setPriority("info");
    setAudience("all");
    setExpiresAt("");
    setFieldErrors({});
    clearImage();
    setEditing(null);
    setRemoveExistingImage(false);
    setShowForm(false);
  }
  function closeForm() {
    if (saving || preparingImage) return;
    if (
      (title.trim() || message.trim() || image || editing) &&
      !window.confirm("Discard unsaved announcement changes?")
    )
      return;
    resetForm();
  }
  function editAnnouncement(a: AnnouncementView) {
    if (saving || preparingImage) return;
    if (
      showForm &&
      (title.trim() || message.trim() || image) &&
      !window.confirm("Discard unsaved announcement changes?")
    )
      return;
    clearImage();
    setEditing(a);
    setRemoveExistingImage(false);
    setTitle(a.title);
    setMessage(a.message);
    setPriority(a.priority);
    setAudience(a.audience);
    setImagePreview(a.imageUrl ?? "");
    if (a.expires_at) {
      const local = new Date(a.expires_at);
      local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
      setExpiresAt(local.toISOString().slice(0, 16));
    } else setExpiresAt("");
    setFieldErrors({});
    setError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function handlePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationLock.current || preparingImage || !validate()) return;
    mutationLock.current = true;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const announcementId = editing?.id ?? crypto.randomUUID();
    let uploadedPath: string | null = null;
    let committed = false;
    try {
      if (image) {
        uploadedPath = `${adminProfileId ?? "admin"}/${announcementId}-${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("announcement-images")
          .upload(uploadedPath, image, {
            contentType: image.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw uploadError;
      }
      const imagePath =
        uploadedPath ??
        (removeExistingImage ? null : (editing?.image_path ?? null));
      const values = {
        title: title.trim(),
        message: message.trim(),
        priority,
        audience,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        image_path: imagePath,
        updated_at: new Date().toISOString(),
      };
      const result = editing
        ? await supabase
            .from("announcements")
            .update(values)
            .eq("id", editing.id)
            .eq("updated_at", editing.updated_at)
            .eq("archived", false)
            .select("id")
            .single()
        : await supabase
            .from("announcements")
            .insert({
              ...values,
              id: announcementId,
              is_published: true,
              published_at: new Date().toISOString(),
              created_by: adminProfileId ?? null,
              archived: false,
            })
            .select("id")
            .single();
      if (result.error) throw result.error;
      committed = true;
      if (editing?.image_path && editing.image_path !== imagePath)
        await supabase.storage
          .from("announcement-images")
          .remove([editing.image_path]);
      const wasEditing = Boolean(editing);
      resetForm();
      setTab("active");
      setSuccess(
        wasEditing
          ? "Announcement updated successfully."
          : "Announcement published successfully.",
      );
      await loadAnnouncements();
    } catch (caught) {
      if (uploadedPath && !committed)
        await supabase.storage
          .from("announcement-images")
          .remove([uploadedPath]);
      setError(
        (caught as { message?: string })?.message ??
          "Announcement could not be saved. Refresh if another administrator changed it.",
      );
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }
  async function togglePublished(a: AnnouncementView) {
    const next = !a.is_published;
    setError(null);
    const expired = Boolean(
      a.expires_at && new Date(a.expires_at).getTime() <= currentTime,
    );
    const { error: updateError } = await supabase
      .from("announcements")
      .update({
        is_published: next,
        published_at: next ? new Date().toISOString() : a.published_at,
        expires_at: next && expired ? null : a.expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id)
      .eq("updated_at", a.updated_at)
      .select("id")
      .single();
    if (updateError) setError(updateError.message);
    else {
      setSuccess(next ? "Announcement published." : "Announcement hidden.");
      await loadAnnouncements();
    }
  }
  async function archiveAnnouncement(a: AnnouncementView) {
    if (
      !window.confirm(`Archive “${a.title}”? Residents will no longer see it.`)
    )
      return;
    const { error: updateError } = await supabase
      .from("announcements")
      .update({
        archived: true,
        archived_at: new Date().toISOString(),
        archived_by: adminProfileId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id)
      .eq("updated_at", a.updated_at)
      .select("id")
      .single();
    if (updateError) setError(updateError.message);
    else {
      setSuccess("Announcement archived.");
      await loadAnnouncements();
    }
  }
  async function restoreAnnouncement(a: AnnouncementView) {
    const { error: updateError } = await supabase
      .from("announcements")
      .update({
        archived: false,
        archived_at: null,
        archived_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id)
      .eq("updated_at", a.updated_at)
      .select("id")
      .single();
    if (updateError) setError(updateError.message);
    else {
      setSuccess("Announcement restored.");
      await loadAnnouncements();
    }
  }
  async function permanentlyDelete(a: AnnouncementView) {
    if (
      !a.archived ||
      !window.confirm(`Permanently delete “${a.title}”? This cannot be undone.`)
    )
      return;
    const { error: deleteError } = await supabase
      .from("announcements")
      .delete()
      .eq("id", a.id)
      .eq("archived", true)
      .select("id")
      .single();
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (a.image_path) {
      const { error: cleanupError } = await supabase.storage
        .from("announcement-images")
        .remove([a.image_path]);
      if (cleanupError)
        setError(
          "The archived announcement was deleted, but its image could not be removed from storage.",
        );
    }
    setSuccess("Archived announcement permanently deleted.");
    await loadAnnouncements();
  }

  async function runAction(action: () => Promise<void>) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (caught) {
      setError(
        (caught as { message?: string })?.message ??
          "Announcement action failed.",
      );
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }
  const inputClass = (field: keyof FieldErrors) =>
    `input mt-2 ${fieldErrors[field] ? "border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-100" : ""}`;
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-700 to-indigo-700 p-6 text-white">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Megaphone size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
                Resident communication
              </p>
              <h2 className="mt-1 text-2xl font-bold">Announcements</h2>
              <p className="mt-2 text-sm text-blue-100">
                Publish responsive banner notices and manage an archive.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showForm) closeForm();
              else setShowForm(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-blue-800"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}{" "}
            {showForm ? "Close form" : "Add Announcement"}
          </button>
        </div>
      </div>
      {(error || queryError) && (
        <div className="m-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={17} />
          {error || queryError}
        </div>
      )}
      {success && (
        <div className="m-6 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 size={17} />
          {success}
        </div>
      )}
      <div className={`grid ${showForm ? "xl:grid-cols-[0.9fr_1.1fr]" : ""}`}>
        {showForm && (
          <form
            onSubmit={handlePublish}
            noValidate
            className="border-b border-slate-200 p-6 xl:border-b-0 xl:border-r"
          >
            <h3 className="font-bold text-slate-900">Create announcement</h3>
            <p className="mt-1 text-xs text-slate-500">
              <span className="text-red-600">*</span> Required fields
            </p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Announcement Title <span className="text-red-600">*</span>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      title: undefined,
                    }));
                  }}
                  maxLength={120}
                  className={inputClass("title")}
                  aria-invalid={Boolean(fieldErrors.title)}
                />
                {fieldErrors.title && (
                  <span className="mt-1 block text-xs font-semibold text-red-600">
                    {fieldErrors.title}
                  </span>
                )}
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Message <span className="text-red-600">*</span>
                <textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      message: undefined,
                    }));
                  }}
                  maxLength={2000}
                  rows={6}
                  className={`${inputClass("message")} min-h-32 resize-y`}
                  aria-invalid={Boolean(fieldErrors.message)}
                />
                {fieldErrors.message && (
                  <span className="mt-1 block text-xs font-semibold text-red-600">
                    {fieldErrors.message}
                  </span>
                )}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Priority <span className="text-red-600">*</span>
                  <select
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as AnnouncementPriority)
                    }
                    className={inputClass("priority")}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Audience <span className="text-red-600">*</span>
                  <select
                    value={audience}
                    onChange={(e) =>
                      setAudience(e.target.value as AnnouncementAudience)
                    }
                    className={inputClass("audience")}
                  >
                    {ACTIVE_AUDIENCES.map((value) => (
                      <option key={value} value={value}>
                        {AUDIENCE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Expiration (optional)
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => {
                    setExpiresAt(e.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      expiresAt: undefined,
                    }));
                  }}
                  className={inputClass("expiresAt")}
                />
                {fieldErrors.expiresAt && (
                  <span className="mt-1 block text-xs font-semibold text-red-600">
                    {fieldErrors.expiresAt}
                  </span>
                )}
              </label>
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Photo (optional)
                </p>
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-600 hover:border-blue-400">
                  <ImagePlus size={20} />
                  Add Photo
                  <input
                    type="file"
                    disabled={saving || preparingImage}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      void chooseImage(e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {imagePreview && (
                  <div className="relative mt-3 aspect-[16/7] overflow-hidden rounded-2xl border border-slate-200">
                    <img
                      src={imagePreview}
                      alt="Announcement banner preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      disabled={saving || preparingImage}
                      aria-label="Remove image"
                      className="absolute right-2 top-2 rounded-full bg-slate-950/70 p-2 text-white"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Images are center-cropped to the same 16:7 banner shape
                  residents will see.
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || preparingImage}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Send />}
              {preparingImage
                ? "Preparing image…"
                : saving
                  ? "Saving…"
                  : editing
                    ? "Save Changes"
                    : "Publish announcement"}
            </button>
          </form>
        )}
        <div className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Announcement history</h3>
              <p className="mt-1 text-sm text-slate-500">
                Archive announcements before permanent deletion.
              </p>
            </div>
            <BellRing className="text-blue-700" />
          </div>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "active" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              Active ({counts.active})
            </button>
            <button
              type="button"
              onClick={() => setTab("archived")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "archived" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              Archived ({counts.archived})
            </button>
          </div>
          <div className="mt-4">
            <SortControls
              id="announcements"
              field={sortField}
              direction={sortDirection}
              options={[
                {
                  value: "created_at",
                  label: tab === "archived" ? "Date archived" : "Created date",
                },
                { value: "title", label: "Title" },
                { value: "priority", label: "Priority" },
                { value: "audience", label: "Audience" },
              ]}
              onFieldChange={setSortField}
              onDirectionChange={setSortDirection}
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-16 text-slate-500">
              <Loader2 className="mr-2 animate-spin" />
              Loading announcements…
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {visible.map((a) => {
                const long = a.message.length > 240;
                const open = expanded.has(a.id);
                return (
                  <article
                    key={a.id}
                    className={`overflow-hidden rounded-2xl border ${PRIORITY_STYLES[a.priority]}`}
                  >
                    {a.imageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({
                            title: a.title,
                            url: a.imageUrl as string,
                          })
                        }
                        className="block aspect-[16/7] w-full overflow-hidden bg-white/70"
                      >
                        <img
                          src={a.imageUrl}
                          alt={`Attached image for ${a.title}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase">
                            {PRIORITY_LABELS[a.priority]} ·{" "}
                            {AUDIENCE_LABELS[a.audience]}
                          </p>
                          <h4 className="mt-2 font-bold text-slate-900">
                            {a.title}
                          </h4>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${a.archived ? "bg-slate-200 text-slate-700" : a.is_published && (!a.expires_at || new Date(a.expires_at).getTime() > currentTime) ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                        >
                          {a.archived
                            ? "Archived"
                            : a.is_published
                              ? a.expires_at &&
                                new Date(a.expires_at).getTime() <= currentTime
                                ? "Expired"
                                : "Published"
                              : "Hidden"}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {long && !open
                          ? `${a.message.slice(0, 240).trim()}…`
                          : a.message}
                      </p>
                      {long && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((previous) => {
                              const next = new Set(previous);
                              if (next.has(a.id)) next.delete(a.id);
                              else next.add(a.id);
                              return next;
                            })
                          }
                          className="mt-2 text-sm font-bold text-blue-700"
                        >
                          {open ? "Show Less" : "See More"}
                        </button>
                      )}
                      <p className="mt-3 text-xs text-slate-500">
                        {a.archived
                          ? `Archived ${formatDateTime(a.archived_at)}`
                          : `Published ${formatDateTime(a.published_at)}`}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {!a.archived ? (
                          <>
                            <button
                              type="button"
                              disabled={saving || preparingImage}
                              className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700"
                              onClick={() => editAnnouncement(a)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void runAction(() => togglePublished(a))
                              }
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                            >
                              {a.is_published ? "Hide" : "Publish"}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void runAction(() => archiveAnnouncement(a))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700"
                            >
                              <Archive size={14} />
                              Archive
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void runAction(() => restoreAnnouncement(a))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700"
                            >
                              <RotateCcw size={14} />
                              Restore
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void runAction(() => permanentlyDelete(a))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700"
                            >
                              <Trash2 size={14} />
                              Permanently Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {!visible.length && (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 px-5 py-12 text-center text-sm text-slate-500">
                  No {tab} announcements.
                </div>
              )}
              <PaginationControls
                page={page}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>
      {previewImage && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/90 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPreviewImage(null);
          }}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-5 top-5 rounded-full bg-white p-2 text-slate-900"
          >
            <X size={20} />
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.title}
            className="max-h-[90vh] max-w-full rounded-2xl object-contain"
          />
        </div>
      )}
    </section>
  );
}
