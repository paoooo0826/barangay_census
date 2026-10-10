import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { analyticsLabel } from "../lib/displayLabels";
export interface AnalyticsChart {
  section: string;
  title: string;
  unit: string;
  period: boolean;
  kind: string;
  note?: string;
  rows: { label: string; count: number }[];
}
interface AnalyticsData {
  residentTotal: number;
  recordTotal: number;
  duplicateRecords: number;
  addressGroups: number;
  postedPayments: number;
  charts: AnalyticsChart[];
}
const number = new Intl.NumberFormat("en-PH");
const colors = [
  "#166534",
  "#d97706",
  "#0284c7",
  "#7c3aed",
  "#dc2626",
  "#64748b",
];
export function AnalyticsChartCard({ chart }: { chart: AnalyticsChart }) {
  const rows = chart.rows.map((row) => ({
    ...row,
    displayLabel: analyticsLabel(row.label),
  }));
  const total = chart.rows.reduce((sum, row) => sum + row.count, 0),
    max = Math.max(1, ...chart.rows.map((r) => r.count));
  let offset = 0;
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold text-slate-900">{chart.title}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {chart.period ? "Activity in selected period" : "Current totals"} ·{" "}
        {number.format(total)} {chart.unit}
      </p>
      {chart.note && (
        <p className="mt-2 text-xs leading-5 text-slate-600">{chart.note}</p>
      )}
      {total === 0 ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
          No records available for this statistic.
        </p>
      ) : (
        <>
          {chart.kind === "donut" && (
            <svg
              viewBox="0 0 120 120"
              role="img"
              aria-label={`${chart.title}: ${total} ${chart.unit}`}
              className="mx-auto my-4 h-36 w-36 -rotate-90"
            >
              {rows.map((r, i) => {
                const length = (r.count / total) * 251.33,
                  at = offset;
                offset += length;
                return (
                  <circle
                    key={r.label}
                    cx="60"
                    cy="60"
                    r="40"
                    fill="none"
                    stroke={colors[i % colors.length]}
                    strokeWidth="18"
                    strokeDasharray={`${length} ${251.33 - length}`}
                    strokeDashoffset={-at}
                  >
                    <title>
                      {`${r.displayLabel}: ${r.count} (${Math.round((r.count / total) * 100)}%)`}
                    </title>
                  </circle>
                );
              })}
            </svg>
          )}
          {chart.kind === "trend" && (
            <svg
              viewBox="0 0 320 110"
              role="img"
              aria-label={`${chart.title}; monthly ${chart.unit}`}
              className="my-4 h-28 w-full overflow-visible"
            >
              <line x1="10" y1="95" x2="310" y2="95" stroke="#cbd5e1" />
              <text x="0" y="108" fontSize="9">
                0
              </text>
              <polyline
                fill="none"
                stroke="#166534"
                strokeWidth="3"
                points={rows
                  .map(
                    (r, i) =>
                      `${10 + (i * 300) / Math.max(1, chart.rows.length - 1)},${95 - (r.count / max) * 80}`,
                  )
                  .join(" ")}
              />
              {rows.map((r, i) => (
                <circle
                  key={r.label}
                  cx={10 + (i * 300) / Math.max(1, chart.rows.length - 1)}
                  cy={95 - (r.count / max) * 80}
                  r="4"
                  fill="#166534"
                >
                  <title>
                    {`${r.displayLabel}: ${r.count} ${chart.unit}`}
                  </title>
                </circle>
              ))}
            </svg>
          )}
          <ul className="mt-4 space-y-3">
            {rows.map((r, i) => (
              <li
                key={r.label}
                title={`${r.displayLabel}: ${r.count} ${chart.unit} (${((r.count / total) * 100).toFixed(1)}%)`}
              >
                <div className="mb-1 flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">
                    {chart.kind === "donut" && (
                      <span
                        aria-hidden="true"
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: colors[i % colors.length] }}
                      />
                    )}
                    {r.displayLabel}
                  </span>
                  <span className="shrink-0 font-semibold">
                    {number.format(r.count)}
                  </span>
                </div>
                {chart.kind === "bar" && (
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-pine-700"
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
export default function AdminAnalytics({
  refreshKey,
}: {
  refreshKey?: number;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState("all"),
    [section, setSection] = useState("Residents");
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const read = async () => {
      const request = ++generation.current;
      if (from && to && from > to) {
        setError("The start date must precede the end date.");
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const r = await supabase.rpc("admin_system_analytics", {
          p_from: from || null,
          p_to: to || null,
          p_status: status,
        });
        if (!active || request !== generation.current) return;
        if (r.error) throw r.error;
        setData(r.data as unknown as AnalyticsData);
        setError("");
      } catch (e) {
        if (active && request === generation.current) {
          setData(null);
          setError(
            e && typeof e === "object" && "message" in e
              ? String(e.message)
              : "Unable to load analytics. Retry when connected.",
          );
        }
      } finally {
        if (active && request === generation.current) setLoading(false);
      }
    };
    void read();
    const timer = window.setInterval(() => {
      if (!document.hidden) void read();
    }, 60_000);
    return () => {
      active = false;
      ++generation.current;
      window.clearInterval(timer);
    };
  }, [from, to, status, refreshKey]);
  const sections = [...new Set((data?.charts ?? []).map((c) => c.section))];
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Barangay Analytics
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Aggregate statistics from current records. Dates filter activity
          charts and collected payments; current totals remain unchanged.
          Resident status filters resident and verification charts. No names,
          contact details, addresses, or ID images are included.
        </p>
      </div>
      <div className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-3">
        <label className="text-sm font-semibold">
          Activity From
          <input
            aria-label="Activity From"
            type="date"
            className="input-field mt-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm font-semibold">
          Activity Through
          <input
            aria-label="Activity Through"
            type="date"
            className="input-field mt-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-sm font-semibold">
          Resident Status
          <select
            className="input-field mt-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["all", "verified", "pending_review", "returned", "rejected"].map(
              (s) => (
                <option key={s} value={s}>
                  {analyticsLabel(s)}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading analytics…</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Current Unique Residents", data.residentTotal],
              ["Distinct Address Groups", data.addressGroups],
              ["Duplicate Account Records Excluded", data.duplicateRecords],
              ["Posted Payments in Period (PHP)", data.postedPayments],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-white p-5">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-pine-800">
                  {number.format(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Address groups are not verified household counts: the database has
            no independent household identifier. Resident charts use the latest
            record per account. Missing values are shown explicitly. Occupations
            are grouped to avoid displaying personal free text.
          </p>
          <nav aria-label="Analytics sections" className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === section}
                onClick={() => setSection(s)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${s === section ? "bg-pine-700 text-white" : "border bg-white text-slate-700"}`}
              >
                {s}
              </button>
            ))}
          </nav>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {data.charts
              .filter((c) => c.section === section)
              .map((c) => (
                <AnalyticsChartCard key={c.title} chart={c} />
              ))}
          </div>
        </>
      )}
    </section>
  );
}
