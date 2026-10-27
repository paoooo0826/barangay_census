import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { usePagedQuery, searchPattern } from "../hooks/usePagedQuery";
import { updateHashQuery, useHashRoute } from "../hooks/useHashRoute";
import { useDialogFocus } from "../hooks/useDialogFocus";
import {
  errorMessage,
  titleCase,
  INCIDENT_CATEGORIES,
  INCIDENT_STATUSES,
  FEEDBACK_STATUSES,
  type CommunityCase,
} from "../lib/community";
import { manilaDate, paymentTime } from "../lib/payments";
import { RESIDENT_IMAGE_ACCEPT } from "../lib/imageValidation";
import { useImageCrop } from "./ImageCropDialog";
import FullscreenImageViewer from "./FullscreenImageViewer";
import PaginationControls from "./PaginationControls";

type Kind = "feedback" | "incident";
interface DraftImage {
  id: string;
  file: File;
}
export default function CommunityCases({
  kind,
  admin = false,
}: {
  kind: Kind;
  admin?: boolean;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const incident = kind === "incident",
    table = incident ? "incident_reports" : "resident_feedback";
  const statuses = incident ? INCIDENT_STATUSES : FEEDBACK_STATUSES;
  const route = useHashRoute(),
    item = new URLSearchParams(route.split("?")[1] ?? "").get("item");
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const invalidRange = Boolean(admin && from && to && from > to);
  const [selected, setSelected] = useState<CommunityCase | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [content, setContent] = useState(""),
    [category, setCategory] = useState(incident ? "safety_concern" : "comment"),
    [location, setLocation] = useState(""),
    [occurred, setOccurred] = useState("");
  const [images, setImages] = useState<DraftImage[]>([]),
    [busy, setBusy] = useState(false);
  const { crop, cropDialog } = useImageCrop();
  const lock = useRef(false),
    mounted = useRef(true),
    request = useRef(0),
    retry = useRef<{
      payload: string;
      key: string;
      paths: Record<string, string>;
    } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++request.current;
    };
  }, []);
  const query = useCallback(
    (start: number, end: number) => {
      let q = supabase.from(table).select("*", { count: "exact" });
      if (!admin) q = q.eq("user_id", userId ?? "");
      if (admin && status !== "all") q = q.eq("status", status);
      if (admin && search.trim())
        q = q.ilike(
          incident ? "description" : "content",
          searchPattern(search),
        );
      if (admin && from) q = q.gte("created_at", `${from}T00:00:00+08:00`);
      if (admin && to)
        q = q.lt(
          "created_at",
          new Date(Date.parse(`${to}T00:00:00+08:00`) + 86400000).toISOString(),
        );
      return q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(start, end);
    },
    [table, status, search, from, to, incident, admin, userId],
  );
  const list = usePagedQuery<CommunityCase>({
    page,
    pageSize: 8,
    onPageChange: setPage,
    query,
    enabled: Boolean(user) && !invalidRange,
  });
  useEffect(() => {
    setPage(1);
  }, [status, search, from, to]);
  useEffect(() => {
    setSelected(null);
    if (!item || !user) return;
    let active = true;
    const load = async () => {
      const generation = ++request.current;
      try {
        let query = supabase.from(table).select("*").eq("id", item);
        if (!admin) query = query.eq("user_id", user.id);
        const result = await query.maybeSingle();
        if (!active || generation !== request.current) return;
        if (result.error) throw result.error;
        if (!result.data) {
          setSelected(null);
          setError("This item is unavailable to your account.");
          return;
        }
        setSelected(result.data as CommunityCase);
      } catch (e) {
        if (active && generation === request.current) setError(errorMessage(e));
      }
    };
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = admin ? null : window.setInterval(refresh, 30000);
    if (!admin) {
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
    }
    return () => {
      active = false;
      ++request.current;
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [item, table, user?.id, admin]);
  async function pickImage(file?: File) {
    if (!file || busy) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Incident images must be 5 MB or smaller.");
      const result = await crop(file, "household");
      if (result && mounted.current) {
        if (result.size > 5 * 1024 * 1024)
          throw new Error("The cropped image must be 5 MB or smaller.");
        setImages((v) =>
          v.length < 3 ? [...v, { id: crypto.randomUUID(), file: result }] : v,
        );
      }
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !user) return;
    const description = content.trim(),
      place = location.trim();
    if (
      description.length < (incident ? 20 : 10) ||
      description.length > (incident ? 6000 : 4000)
    ) {
      setError(
        `Write ${incident ? 20 : 10} to ${incident ? 6000 : 4000} characters.`,
      );
      return;
    }
    if (
      incident &&
      (!occurred ||
        !Number.isFinite(Date.parse(`${occurred}+08:00`)) ||
        Date.parse(`${occurred}+08:00`) > Date.now() ||
        place.length < 5)
    ) {
      setError(
        "Provide the location and a valid past incident date and time in Manila.",
      );
      return;
    }
    const payload = JSON.stringify({
      category,
      description,
      place,
      occurred,
      images: images.map((i) => i.id),
    });
    if (retry.current?.payload !== payload)
      retry.current = { payload, key: crypto.randomUUID(), paths: {} };
    const attempt = retry.current;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (incident)
        for (const image of images) {
          if (attempt.paths[image.id]) continue;
          const path = `${user.id}/${attempt.key}/${image.id}.${image.file.type === "image/png" ? "png" : image.file.type === "image/webp" ? "webp" : "jpg"}`;
          const result = await supabase.storage
            .from("incident-attachments")
            .upload(path, image.file, {
              contentType: image.file.type,
              upsert: false,
            });
          // A lost upload response can be retried at the same path. The RPC verifies the stored object.
          if (
            result.error &&
            result.error.message !== "The resource already exists"
          )
            throw result.error;
          attempt.paths[image.id] = path;
        }
      const result = incident
        ? await supabase.rpc("submit_incident_report", {
            p_category: category,
            p_description: description,
            p_location: place,
            p_occurred_at: new Date(`${occurred}+08:00`).toISOString(),
            p_image_paths: images.map((i) => attempt.paths[i.id]),
            p_request_key: attempt.key,
          })
        : await supabase.rpc("submit_resident_feedback", {
            p_kind: category,
            p_content: description,
            p_request_key: attempt.key,
          });
      if (result.error) throw result.error;
      const saved = result.data as unknown as CommunityCase;
      if (!saved?.id)
        throw new Error(
          "Submission was not confirmed. Retry without changing the form.",
        );
      if (!mounted.current) return;
      retry.current = null;
      setContent("");
      setLocation("");
      setOccurred("");
      setImages([]);
      setPage(1);
      setSuccess(
        incident
          ? `Report submitted: ${saved.tracking_reference}. It awaits review.`
          : "Your written feedback was submitted for review.",
      );
      updateHashQuery({ item: saved.id });
      await list.reload();
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const close = () => {
    setSelected(null);
    updateHashQuery({ item: null });
  };
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">
          {incident
            ? admin
              ? "Incident Reports"
              : "Report an Incident"
            : admin
              ? "Written Feedback"
              : "Send Feedback"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {incident
            ? "Reports are submitted information requiring review; an allegation is not a verified incident. Do not use this form for an emergency."
            : "Send comments, suggestions, or concerns to the barangay office. Feedback is separate from incident reports."}{" "}
          {admin
            ? "Only authorized administrators can review these records."
            : "Only your submissions and responses intended for you are shown."}
        </p>
      </div>
      {!admin && (
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-4 rounded-2xl border bg-white p-5"
        >
          <label className="label">
            {incident ? "Incident Category" : "Feedback Type"}
            <select
              className="input mt-2"
              value={category}
              disabled={busy}
              onChange={(e) => setCategory(e.target.value)}
            >
              {(incident
                ? INCIDENT_CATEGORIES
                : ["comment", "suggestion", "concern"]
              ).map((v) => (
                <option key={v} value={v}>
                  {titleCase(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            {incident ? "Description" : "Your Feedback"}
            <textarea
              required
              minLength={incident ? 20 : 10}
              maxLength={incident ? 6000 : 4000}
              rows={5}
              className="input mt-2"
              value={content}
              disabled={busy}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          {incident && (
            <>
              <label className="label">
                Location
                <input
                  required
                  minLength={5}
                  maxLength={300}
                  className="input mt-2"
                  value={location}
                  disabled={busy}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
              <label className="label">
                Incident Date and Time (Manila)
                <input
                  required
                  type="datetime-local"
                  max={`${manilaDate()}T23:59`}
                  className="input mt-2"
                  value={occurred}
                  disabled={busy}
                  onChange={(e) => setOccurred(e.target.value)}
                />
              </label>
              <label className="label">
                Supporting Images (Optional, up to 3)
                <input
                  type="file"
                  accept={RESIDENT_IMAGE_ACCEPT}
                  disabled={busy || images.length >= 3}
                  className="mt-2 block w-full text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void pickImage(file);
                  }}
                />
              </label>
              <p className="text-xs text-slate-500">
                JPEG, PNG or WebP, up to 5 MB each. Adjust the crop before
                attaching; preserve relevant details.
              </p>
              <div className="flex flex-wrap gap-3">
                {images.map((image) => (
                  <SelectedImage
                    key={image.id}
                    image={image}
                    disabled={busy}
                    remove={() =>
                      setImages((v) => v.filter((i) => i.id !== image.id))
                    }
                  />
                ))}
              </div>
            </>
          )}
          <button
            disabled={busy}
            type="submit"
            className="rounded-xl bg-pine-700 px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {busy
              ? "Submitting…"
              : incident
                ? "Submit Report"
                : "Submit Feedback"}
          </button>
        </form>
      )}
      {(error || list.error) && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error || list.error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-xl bg-pine-50 p-4 text-pine-800">
          {success}
        </p>
      )}
      {admin && (
        <div className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="label">
            Search Description
            <input
              type="search"
              className="input mt-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="label">
            Status
            <select
              className="input mt-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              {statuses.map((s) => (
                <option value={s} key={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Submitted From
            <input
              type="date"
              className="input mt-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="label">
            Submitted Through
            <input
              type="date"
              min={from}
              className="input mt-2"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      )}
      {invalidRange && (
        <p role="alert" className="text-sm text-red-700">
          The start date must be on or before the end date.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">
          {admin
            ? "Submitted Records"
            : incident
              ? "My Reports"
              : "My Feedback"}
        </h3>
        <button
          type="button"
          className="text-sm font-bold text-pine-700 underline"
          onClick={() => void list.reload()}
        >
          {admin ? "Refresh" : "Refresh My Updates"}
        </button>
      </div>
      {invalidRange ? null : list.loading ? (
        <p role="status">Loading…</p>
      ) : !list.rows.length ? (
        <p className="rounded-2xl border border-dashed p-8 text-slate-500">
          {admin
            ? `No matching ${incident ? "reports" : "feedback submissions"}.`
            : incident
              ? "You haven’t submitted any incident reports yet."
              : "You haven’t sent feedback yet."}
        </p>
      ) : (
        list.rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => updateHashQuery({ item: row.id })}
            className="block w-full rounded-2xl border bg-white p-5 text-left"
          >
            <span className="flex flex-wrap justify-between gap-2 font-bold">
              <span>
                {row.tracking_reference ?? titleCase(row.kind ?? "Feedback")}
              </span>
              <span className="text-pine-700">{titleCase(row.status)}</span>
            </span>
            <span className="mt-2 block whitespace-pre-wrap break-words text-sm">
              {(row.description ?? row.content ?? "").slice(0, 180)}
              {(row.description ?? row.content ?? "").length > 180 ? "…" : ""}
            </span>
            <time className="mt-2 block text-xs text-slate-500">
              {paymentTime(row.created_at)}
            </time>
            <span className="mt-2 block text-xs font-bold text-pine-700">
              View Details and History
            </span>
          </button>
        ))
      )}
      {!invalidRange && (
        <PaginationControls
          page={page}
          totalItems={list.total}
          pageSize={8}
          onPageChange={setPage}
        />
      )}
      {selected && (
        <CaseDetails
          key={selected.id}
          item={selected}
          kind={kind}
          admin={admin}
          close={close}
          changed={(saved) => {
            setSelected(saved);
            void list.reload();
          }}
        />
      )}
      {cropDialog}
    </section>
  );
}
function SelectedImage({
  image,
  disabled,
  remove,
}: {
  image: DraftImage;
  disabled: boolean;
  remove: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(image.file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [image.file]);
  return (
    <div className="w-32">
      <img
        src={url}
        alt="Selected report attachment"
        className="h-24 w-32 rounded-xl object-contain"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={remove}
        className="mt-1 text-sm text-red-700 underline"
      >
        Remove
      </button>
    </div>
  );
}
function CaseDetails({
  item,
  kind,
  admin,
  close,
  changed,
}: {
  item: CommunityCase;
  kind: Kind;
  admin: boolean;
  close: () => void;
  changed: (value: CommunityCase) => void;
}) {
  const [status, setStatus] = useState(item.status),
    [response, setResponse] = useState(item.response),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [images, setImages] = useState<{ path: string; url: string }[]>([]),
    [preview, setPreview] = useState<string | null>(null),
    [history, setHistory] = useState<
      { id: string; status: string; message: string; created_at: string }[]
    >([]),
    [historyPage, setHistoryPage] = useState(1),
    [historyTotal, setHistoryTotal] = useState(0);
  const lock = useRef(false),
    mounted = useRef(true);
  const dialog = useDialogFocus<HTMLDivElement>(
    true,
    () => {
      if (!busy) close();
    },
    null,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const h = await supabase
        .from("community_case_updates")
        .select("id,status,message,created_at", { count: "exact" })
        .eq(kind === "incident" ? "incident_id" : "feedback_id", item.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((historyPage - 1) * 10, historyPage * 10 - 1);
      if (!active) return;
      if (h.error) setError(h.error.message);
      else {
        setHistory(h.data ?? []);
        setHistoryTotal(h.count ?? 0);
      }
      if (kind !== "incident") return;
      const a = await supabase
        .from("incident_attachments")
        .select("object_path")
        .eq("report_id", item.id);
      if (!active) return;
      if (a.error) {
        setError(a.error.message);
        return;
      }
      const values = await Promise.all(
        (a.data ?? []).map(async (row) => {
          const r = await supabase.storage
            .from("incident-attachments")
            .createSignedUrl(row.object_path, 3600);
          if (r.error) throw r.error;
          return { path: row.object_path as string, url: r.data.signedUrl };
        }),
      );
      if (active) setImages(values);
    };
    void load().catch((e) => {
      if (active) setError(errorMessage(e));
    });
    return () => {
      active = false;
    };
  }, [kind, item.id, item.updated_at, historyPage]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("review_community_case", {
        p_kind: kind,
        p_id: item.id,
        p_expected_updated_at: item.updated_at,
        p_status: status,
        p_response: response.trim(),
      });
      if (r.error) throw r.error;
      const value = r.data as unknown as CommunityCase;
      if (!value?.id) throw new Error("Review was not confirmed.");
      if (mounted.current) changed(value);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={
          kind === "incident" ? "Incident report details" : "Feedback details"
        }
        tabIndex={-1}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) close();
        }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4"
      >
        <div className="dialog-panel w-full max-w-2xl rounded-3xl bg-white p-5 sm:p-7">
          <div className="flex justify-between gap-4">
            <h3 className="text-xl font-bold">
              {item.tracking_reference ?? "Feedback Details"}
            </h3>
            <button
              type="button"
              aria-label="Close details"
              disabled={busy}
              onClick={close}
              className="icon-button"
            >
              <X size={20} />
            </button>
          </div>
          <p className="mt-3 font-bold text-pine-700">
            {titleCase(item.status)} ·{" "}
            {titleCase(item.category ?? item.kind ?? "")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Submitted {paymentTime(item.created_at)} · Updated{" "}
            {paymentTime(item.updated_at)}
          </p>
          <p className="mt-4 whitespace-pre-wrap break-words leading-7">
            {item.description ?? item.content}
          </p>
          {item.location && (
            <p className="mt-3 break-words">
              <strong>Location:</strong> {item.location}
            </p>
          )}
          {item.occurred_at && (
            <p className="mt-2">
              <strong>Reported Event Time (Manila):</strong>{" "}
              {paymentTime(item.occurred_at)}
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {images.map((image) => (
              <button
                key={image.path}
                type="button"
                onClick={() => setPreview(image.url)}
                className="rounded-xl border p-2"
              >
                <img
                  src={image.url}
                  alt="Private supporting attachment"
                  className="max-h-52 w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.alt =
                      "Image unavailable. Reopen this report to reload.";
                  }}
                />
                <span className="text-xs font-bold text-pine-700">
                  View Full Screen
                </span>
              </button>
            ))}
          </div>
          {item.response && (
            <div className="mt-4 rounded-xl bg-pine-50 p-4">
              <strong>Barangay Response</strong>
              <p className="mt-2 whitespace-pre-wrap break-words">
                {item.response}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 text-red-700">
              {error} Close and reopen this item to reload the latest record.
            </p>
          )}
          {admin && (
            <form
              onSubmit={(e) => void save(e)}
              className="mt-5 space-y-3 border-t pt-4"
            >
              <label className="label">
                Review Status
                <select
                  className="input mt-2"
                  value={status}
                  disabled={busy}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {(kind === "incident"
                    ? INCIDENT_STATUSES
                    : FEEDBACK_STATUSES
                  ).map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Response / Action Taken (Visible to Resident)
                <textarea
                  className="input mt-2"
                  maxLength={4000}
                  required={status === "rejected"}
                  minLength={status === "rejected" ? 3 : 0}
                  value={response}
                  disabled={busy}
                  onChange={(e) => setResponse(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-pine-700 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save Review"}
              </button>
            </form>
          )}
          <h4 className="mt-6 font-bold">Status and Response History</h4>
          {!history.length && (
            <p className="mt-2 text-sm text-slate-500">
              No review updates yet.
            </p>
          )}
          {history.map((h) => (
            <div key={h.id} className="mt-3 border-t pt-3 text-sm">
              <strong>{titleCase(h.status)}</strong>
              <time className="ml-2 text-xs text-slate-500">
                {paymentTime(h.created_at)}
              </time>
              <p className="mt-1 whitespace-pre-wrap break-words">
                {h.message || "Status updated."}
              </p>
            </div>
          ))}
          <PaginationControls
            page={historyPage}
            totalItems={historyTotal}
            pageSize={10}
            onPageChange={setHistoryPage}
          />
        </div>
      </div>
      {preview && (
        <FullscreenImageViewer
          src={preview}
          title="Incident Supporting Image"
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
