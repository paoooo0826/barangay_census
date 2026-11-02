import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/community";
import { hasProfanity, requireRespectfulText } from "../lib/profanity";
import { paymentTime } from "../lib/payments";
export interface UpdateFeedback {
  id: string;
  history_id: string;
  resident_id: string;
  message: string;
  version: number;
  updated_at: string;
}
export default function ResidentUpdateFeedback({
  residentId,
  historyId,
  feedback,
  loading,
  admin,
  onSaved,
  onReload,
}: {
  residentId: string;
  historyId: string;
  feedback?: UpdateFeedback;
  loading: boolean;
  admin: boolean;
  onSaved: (feedback: UpdateFeedback) => void;
  onReload: () => void;
}) {
  const [message, setMessage] = useState(feedback?.message ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  const mounted = useRef(true),
    lock = useRef(false),
    retry = useRef<{ message: string; key: string } | null>(null);
  const [dirty, setDirty] = useState(false),
    [baseVersion, setBaseVersion] = useState(feedback?.version ?? 0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) {
      setMessage(feedback?.message ?? "");
      setBaseVersion(feedback?.version ?? 0);
    }
  }, [feedback?.version, feedback?.message, dirty]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || loading) return;
    const clean = message.trim();
    try {
      if (clean.length < 3 || clean.length > 3000)
        throw new Error("Write feedback with 3 to 3000 characters.");
      requireRespectfulText(clean);
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    if (retry.current?.message !== clean)
      retry.current = { message: clean, key: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await supabase.rpc("save_resident_update_feedback", {
        p_resident_id: residentId,
        p_history_id: historyId,
        p_message: clean,
        p_expected_version: baseVersion,
        p_request_key: retry.current.key,
      });
      if (r.error) throw r.error;
      const saved = r.data as unknown as UpdateFeedback;
      if (
        !saved?.id ||
        saved.history_id !== historyId ||
        saved.resident_id !== residentId
      )
        throw new Error(
          "Feedback was not confirmed. Retry without changing it.",
        );
      if (!mounted.current) return;
      retry.current = null;
      setDirty(false);
      setBaseVersion(saved.version);
      setMessage(saved.message);
      onSaved(saved);
      setSuccess("Feedback saved and sent to the resident.");
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Feedback on this census update"
      className="mt-4 rounded-xl border border-pine-200 bg-white p-4"
    >
      <h3 className="text-sm font-bold text-pine-900">
        Barangay Feedback on This Update
      </h3>
      {loading ? (
        <p role="status" className="mt-2 text-sm">
          Loading feedback…
        </p>
      ) : feedback ? (
        <>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
            {feedback.message}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Barangay Administrator · {paymentTime(feedback.updated_at)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          No administrator feedback on this update yet.
        </p>
      )}
      {admin && (
        <form className="mt-3 space-y-2" onSubmit={(e) => void save(e)}>
          <label className="label">
            {feedback
              ? "Edit Feedback (Visible to Resident)"
              : "Feedback (Visible to Resident)"}
            <textarea
              className="input mt-2"
              rows={3}
              minLength={3}
              maxLength={3000}
              required
              disabled={busy || (loading && !dirty)}
              value={message}
              onChange={(e) => {
                if (!dirty) setBaseVersion(feedback?.version ?? 0);
                setDirty(true);
                setMessage(e.target.value);
                setError("");
                setSuccess("");
              }}
            />
          </label>
          {dirty && (feedback?.version ?? 0) !== baseVersion && (
            <p role="status" className="text-xs text-amber-800">
              Saved feedback changed while you were editing. Your draft is kept;
              reload the saved feedback before replacing it.
            </p>
          )}
          {hasProfanity(message) && (
            <p className="text-xs text-amber-800">
              Revise offensive English or Tagalog wording before saving.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {(error || (dirty && (feedback?.version ?? 0) !== baseVersion)) && (
            <button
              type="button"
              disabled={busy}
              className="text-sm font-bold underline"
              onClick={() => {
                setDirty(false);
                setBaseVersion(feedback?.version ?? 0);
                setMessage(feedback?.message ?? "");
                setError("");
                onReload();
              }}
            >
              Reload Saved Feedback
            </button>
          )}
          {success && (
            <p role="status" className="text-sm text-pine-700">
              {success}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || loading || message.trim().length < 3}
          >
            {busy
              ? "Saving…"
              : feedback
                ? "Update Feedback"
                : "Send Feedback on Update"}
          </button>
        </form>
      )}
    </section>
  );
}
