import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { serviceLabel, RESIDENCY_PURPOSES } from "./ResidentAppointments";
import type { Appointment } from "../types/database";

type Row = Appointment & {
  residents: {
    first_name: string;
    last_name: string;
    suffix: string | null;
  } | null;
};
export default function RecentServices({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("appointments")
      .select("*, residents(first_name,last_name,suffix)")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(5);
    if (e) setError(e.message);
    else {
      setRows((data ?? []) as Row[]);
      setError("");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load, refreshKey]);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Recent Services</h2>
          <p className="text-sm text-slate-500">
            Latest five service requests, newest first.
          </p>
        </div>
        <a
          href="#/admin/dashboard?tab=services"
          className="text-sm font-bold text-pine-700"
        >
          View All Services
        </a>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-500">Loading services…</p>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center"
            >
              <div>
                <p className="font-bold">
                  {row.residents
                    ? [
                        row.residents.first_name,
                        row.residents.last_name,
                        row.residents.suffix,
                      ]
                        .filter(Boolean)
                        .join(" ")
                    : "Resident unavailable"}
                </p>
                <p className="text-sm text-slate-600">
                  {serviceLabel(row.service_type)}
                  {row.service_purpose
                    ? ` — ${RESIDENCY_PURPOSES.find((p) => p.value === row.service_purpose)?.label ?? row.service_purpose}`
                    : ""}
                </p>
                <p className="text-xs text-slate-500">
                  Requested {new Date(row.created_at).toLocaleString("en-PH")} ·{" "}
                  <span className="font-semibold capitalize">{row.status}</span>
                </p>
              </div>
              <a
                className="btn-secondary"
                href={`#/admin/dashboard?tab=services&appointment=${row.id}`}
              >
                View
              </a>
            </article>
          ))
        )}
        {!loading && !rows.length && (
          <p className="text-sm text-slate-500">No service requests yet.</p>
        )}
      </div>
    </section>
  );
}
