import { useCallback, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "../lib/supabase";
import { usePagedQuery } from "../hooks/usePagedQuery";
import { categoryLabel, educationStatusLabel } from "../lib/displayLabels";
import PaginationControls from "./PaginationControls";
import type { Json } from "../types/database";

interface Entry {
  id: string;
  action: string;
  actor_name: string;
  created_at: string;
  details: {
    status?: string;
    remark?: string;
    changes?: Record<string, { before: Json; after: Json }>;
  };
}
const ACTIONS: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
  return: "Returned (previous workflow)",
  census_submitted: "Census submitted",
  census_updated: "Census information updated",
  census_details_updated: "Census attachments / classifications updated",
};
const FIELDS: Record<string, string> = {
  city_municipality: "City / municipality",
  profession_occupation: "Occupation",
  highest_education: "Highest educational attainment",
  email_address: "Account email",
  categories: "Resident classifications",
  household_photo: "Household photo",
  id_document: "ID document",
  live_photo: "Live verification photo",
};
function fieldLabel(field: string) {
  return (
    FIELDS[field] ??
    field.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
  );
}
export function historyValue(value: Json, field: string): string {
  if (value == null || value === "") return "Not provided";
  if (Array.isArray(value))
    return value.map((item) => historyValue(item, field)).join(", ") || "None";
  if (typeof value === "object")
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${fieldLabel(key)}: ${historyValue(item ?? null, key)}`,
      )
      .join("; ");
  if (field === "education_status") return educationStatusLabel(String(value));
  if (field === "categories") return categoryLabel(String(value));
  if (field === "status")
    return (
      (
        {
          verified: "Approved",
          pending_review: "Pending Review",
          rejected: "Rejected",
          returned: "Legacy Returned",
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  return String(value);
}
export default function ResidentRecordHistory({
  residentId,
  refreshKey,
}: {
  residentId: string;
  refreshKey?: string | null;
}) {
  const [page, setPage] = useState(1);
  const query = useCallback(
    (from: number, to: number) =>
      supabase
        .from("admin_resident_history")
        .select("*", { count: "exact" })
        .eq("resident_id", residentId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    [residentId],
  );
  const { rows, total, loading, error } = usePagedQuery<Entry>({
    page,
    pageSize: 8,
    onPageChange: setPage,
    query,
    refreshKey: refreshKey ? new Date(refreshKey).getTime() : 0,
  });
  return (
    <section
      aria-label="Record history"
      className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
        <History size={21} className="text-pine-700" />
        Record History
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Saved review decisions and changes recorded since history tracking was
        enabled.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="mt-4 text-sm">
          Loading history…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No history entries recorded yet.
        </p>
      ) : (
        <ol className="mt-5 space-y-4">
          {rows.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <p className="font-bold">
                {ACTIONS[entry.action] ?? fieldLabel(entry.action)}
              </p>
              <p className="mt-1 break-words text-sm text-slate-600">
                {entry.actor_name} ·{" "}
                {new Date(entry.created_at).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                })}
              </p>
              {entry.details?.status && (
                <p className="mt-2 text-sm">
                  Status: {historyValue(entry.details.status, "status")}
                </p>
              )}
              {entry.details?.remark && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {entry.details.remark}
                </p>
              )}
              {Object.entries(entry.details?.changes ?? {})
                .filter(
                  ([field]) =>
                    !["philsys_number", "vocational_course"].includes(field),
                )
                .map(([field, change]) => (
                  <div
                    key={field}
                    className="mt-3 border-t border-slate-200 pt-3 text-sm"
                  >
                    <p className="font-semibold">{fieldLabel(field)}</p>
                    <dl className="mt-1 grid gap-2 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-xs text-slate-500">Before</dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {historyValue(change.before, field)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-slate-500">After</dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {historyValue(change.after, field)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
            </li>
          ))}
        </ol>
      )}
      <PaginationControls
        page={page}
        pageSize={8}
        totalItems={total}
        onPageChange={setPage}
      />
    </section>
  );
}
