import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useDialogFocus } from "../hooks/useDialogFocus";

interface Period {
  id: string;
  start_date: string;
  end_date: string | null;
  initial_classification: string;
  current_classification: string;
  resident_from: string;
}
interface History {
  period_id: string;
  effective_date: string;
  classification: string;
  reason: string;
}
const labels: Record<string, string> = {
  temporary: "Temporary resident",
  resident: "Resident",
  ended: "Residence period ended",
};
export default function ResidencyDetails({
  residentId,
  admin = false,
  onRecordStart,
}: {
  residentId: string;
  admin?: boolean;
  onRecordStart?: () => void;
}) {
  const lock = useRef(false);
  const request = useRef(0);
  const [action, setAction] = useState<"start" | "end" | null>(null);
  const [date, setDate] = useState("");
  const [classification, setClassification] = useState("temporary");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const generation = ++request.current;
    const [p, h] = await Promise.all([
      supabase
        .from("residency_current")
        .select("*")
        .eq("resident_id", residentId)
        .order("start_date", { ascending: false }),
      supabase
        .from("residency_history")
        .select("*")
        .eq("resident_id", residentId)
        .order("effective_date", { ascending: false }),
    ]);
    if (generation !== request.current) return;
    if (p.error || h.error)
      setError(
        p.error?.message ?? h.error?.message ?? "Unable to load residency.",
      );
    else {
      setPeriods((p.data ?? []) as Period[]);
      setHistory((h.data ?? []) as History[]);
      setError("");
    }
    setLoading(false);
  }, [residentId]);
  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearInterval(timer);
      request.current += 1;
    };
  }, [load]);
  const current = periods.find((p) => !p.end_date);
  const missingStart = !loading && !error && periods.length === 0;
  async function savePeriod(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !action) return;
    lock.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { error: e } = await supabase.rpc("manage_residency", {
        p_resident_id: residentId,
        p_action: action,
        p_date: date,
        p_classification: action === "start" ? classification : null,
      });
      if (e) throw e;
      setAction(null);
      setDate("");
      setSuccess(
        "Residence period saved. Boarding-house occupancy is unchanged.",
      );
      await load();
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Unable to save residence period.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function close() {
    if (
      !saving &&
      (!date || window.confirm("Discard unsaved residence period changes?"))
    ) {
      setAction(null);
      setDate("");
    }
  }
  const dialogRef = useDialogFocus<HTMLDivElement>(Boolean(action), close, null);
  return (
    <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-slate-900">Barangay Residency</h2>
      {success && (
        <p role="status" className="mt-2 text-sm text-sage-700">
          {success}
        </p>
      )}
      {admin && !loading && (
        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() => {
            setAction(current ? "end" : "start");
            setDate("");
          }}
        >
          {current
            ? "Record End of Barangay Residence"
            : "Record Residence Start"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-2 text-sm text-slate-500">Loading residency…</p>
      ) : (
        <>
          {missingStart && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">
                Residence start date required
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Record the actual date residence began. Six-month classification
                can only be calculated from a recorded continuous residence
                period.
              </p>
              {!admin && onRecordStart && (
                <button
                  type="button"
                  className="btn-secondary mt-3"
                  onClick={onRecordStart}
                >
                  Add residence start date
                </button>
              )}
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Current classification</p>
              <p className="font-bold text-pine-700">
                {current
                  ? labels[current.current_classification]
                  : periods.length
                    ? "Residence period ended"
                    : "Residence start date required"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Original residence start</p>
              <p className="font-semibold">
                {current?.start_date ?? "Not recorded"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Original classification</p>
              <p className="font-semibold">
                {current
                  ? labels[current.initial_classification]
                  : "Not recorded"}
              </p>
            </div>
          </div>
          {current?.current_classification === "temporary" && (
            <p className="mt-3 text-sm text-slate-600">
              Resident classification takes effect on {current.resident_from},
              provided residence remains continuous.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Boarding-house departures do not change barangay residency. Existing
            records without a start date are not assigned an invented date.
          </p>
          {history.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-bold text-pine-700">
                Classification History
              </summary>
              <ul className="mt-3 space-y-2">
                {history.map((h) => (
                  <li
                    key={`${h.period_id}-${h.classification}`}
                    className="rounded-xl bg-slate-50 p-3 text-sm"
                  >
                    <strong>{labels[h.classification]}</strong> ·{" "}
                    {h.effective_date}
                    <p className="text-xs text-slate-500">{h.reason}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {action && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={action === "start" ? "Record residence start" : "End barangay residence"}
          tabIndex={-1}
          className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <form
            className="dialog-panel w-full max-w-lg space-y-4 rounded-3xl bg-white p-6"
            onSubmit={savePeriod}
          >
            <h3 className="text-xl font-bold">
              {action === "start"
                ? "Record Residence Start"
                : "End Barangay Residence"}
            </h3>
            <p className="text-sm text-slate-600">
              Use this only for barangay residency. Moving out of a boarding
              house is recorded separately.
            </p>
            <label className="label">
              {action === "start"
                ? "Residence start date"
                : "Last date residing in the barangay"}{" "}
              <span className="text-red-600">*</span>
              <input
                type="date"
                required
                min={action === "end" ? current?.start_date : undefined}
                max={new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Asia/Manila",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date())}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input mt-2"
              />
            </label>
            {action === "start" && (
              <label className="label">
                Initial classification
                <select
                  className="input mt-2"
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                >
                  <option value="temporary">Temporary resident</option>
                  <option value="resident">Resident</option>
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={close}
                className="btn-secondary"
              >
                Close
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
