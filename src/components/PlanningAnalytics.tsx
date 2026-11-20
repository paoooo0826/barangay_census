import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { AnalyticsChartCard } from "./AnalyticsCharts";
import CountLineChart, { type CountSeries } from "./CountLineChart";
import ForecastPanel from "./ForecastPanel";
import type { CensusYear } from "../lib/censusYears";
interface PlanningReport {
  generatedAt: string;
  reportDate: string;
  civil: { label: string; count: number }[];
  annual: CensusYear[];
  monthly: {
    year: number;
    month: number;
    newBoarders: number | null;
    activeBoarders: number | null;
    partial: boolean;
  }[];
  barangays: string[];
  years: number[];
  duplicateRecords: number;
  datedStays: number;
}
function validReport(data: unknown): data is PlanningReport {
  if (!data || typeof data !== "object") return false;
  const d = data as PlanningReport;
  const count = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  return (
    typeof d.reportDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.reportDate) &&
    Number.isFinite(Date.parse(d.generatedAt)) &&
    Array.isArray(d.civil) &&
    d.civil.every((r) => r && typeof r.label === "string" && count(r.count)) &&
    Array.isArray(d.annual) &&
    d.annual.every(
      (r) =>
        r &&
        Number.isInteger(r.year) &&
        (r.count === null || count(r.count)) &&
        ["complete", "partial", "unconfirmed", "missing"].includes(r.coverage),
    ) &&
    Array.isArray(d.monthly) &&
    d.monthly.every(
      (r) =>
        r &&
        Number.isInteger(r.year) &&
        r.month >= 1 &&
        r.month <= 12 &&
        (r.newBoarders === null || count(r.newBoarders)) &&
        (r.activeBoarders === null || count(r.activeBoarders)),
    ) &&
    Array.isArray(d.barangays) &&
    d.barangays.every((s) => typeof s === "string") &&
    Array.isArray(d.years) &&
    d.years.every(Number.isInteger) &&
    count(d.datedStays) &&
    count(d.duplicateRecords)
  );
}
export default function PlanningAnalytics({
  section,
  refreshKey,
}: {
  section: string;
  refreshKey: string;
}) {
  const nowYear = Number(
    new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date()),
  );
  const [year, setYear] = useState(nowYear),
    [compare, setCompare] = useState(""),
    [barangay, setBarangay] = useState(""),
    [censusYear, setCensusYear] = useState(""),
    [status, setStatus] = useState("verified"),
    [metric, setMetric] = useState("both");
  const [result, setResult] = useState<{
      key: string;
      report: PlanningReport;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const key = JSON.stringify([year, compare, barangay, censusYear, status]);
  const report = result?.key === key ? result.report : null;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void supabase
      .rpc("admin_planning_analytics", {
        p_year: year,
        p_compare_year: compare ? Number(compare) : null,
        p_barangay: barangay || null,
        p_census_year: censusYear ? Number(censusYear) : null,
        p_status: status,
      })
      .then(
        ({ data, error: e }) => {
          if (!active) return;
          if (e || !validReport(data)) {
            setError(
              e?.message ||
                "Planning statistics could not be loaded. Refresh to retry.",
            );
            setResult(null);
          } else setResult({ key, report: data });
          setLoading(false);
        },
        () => {
          if (active) {
            setError(
              "Planning statistics could not be loaded. Refresh to retry.",
            );
            setResult(null);
            setLoading(false);
          }
        },
      );
    return () => {
      active = false;
    };
  }, [year, compare, barangay, censusYear, status, key, refreshKey]);
  const options = result?.report;
  const years = options?.years.length ? options.years : [nowYear];
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, i, 1)),
    ),
  );
  const series: CountSeries[] = [];
  for (const yr of [year, ...(compare ? [Number(compare)] : [])]) {
    const rows = report?.monthly.filter((r) => r.year === yr) ?? [];
    if (metric !== "active")
      series.push({
        name: `New boarders · ${yr}`,
        values: months.map(
          (_, i) => rows.find((r) => r.month === i + 1)?.newBoarders ?? null,
        ),
        dashed: yr !== year,
      });
    if (metric !== "new")
      series.push({
        name: `Active boarders · ${yr}`,
        values: months.map(
          (_, i) => rows.find((r) => r.month === i + 1)?.activeBoarders ?? null,
        ),
        dashed: yr !== year,
      });
  }
  const current =
    report?.monthly.filter((r) => r.year === year && r.newBoarders !== null) ??
    [];
  const peak = Math.max(0, ...current.map((r) => r.newBoarders!));
  const peakMonths = current
    .filter((r) => r.newBoarders === peak)
    .map((r) => months[r.month - 1]);
  return (
    <section aria-label="Planning charts" className="min-w-0 space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <h3 className="text-sm font-bold">
          Census and boarding analysis filters
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          These filters apply to the charts below. Civil status defaults to
          verified accounts; census year means the latest submission year, not
          residence start year. Boarding counts are based on dated stays across
          all review statuses.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="label text-xs">
            Barangay
            <select
              className="input mt-1"
              value={barangay}
              onChange={(e) => setBarangay(e.target.value)}
            >
              <option value="">All recorded barangays</option>
              {options?.barangays.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="label text-xs">
            Census submission year
            <select
              className="input mt-1"
              value={censusYear}
              onChange={(e) => setCensusYear(e.target.value)}
            >
              <option value="">All recorded years</option>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="label text-xs">
            Civil-status cohort
            <select
              className="input mt-1"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {[
                ["verified", "Verified"],
                ["all", "All review statuses"],
                ["pending_review", "Pending Review"],
                ["rejected", "Rejected"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl bg-pine-50 p-3 text-xs leading-5">
            {report ? `${report.reportDate} · Asia/Manila` : "Awaiting report"}
            <br />
            Annual history always uses verified accounts across all recorded
            years.
          </div>
        </div>
      </div>
      {loading && (
        <p role="status" className="text-xs text-slate-500">
          Updating planning charts…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {report && (section === "Descriptive" || section === "Diagnostic") && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <AnalyticsChartCard
            chart={{
              title: "Residents by Civil Status",
              section: "Demographics",
              unit: "residents",
              period: false,
              kind: "bar",
              rows: report.civil,
              note: `${status === "verified" ? "Verified accounts" : status === "all" ? "All review statuses" : status} · ${censusYear || "All submission years"} · ${barangay || "All recorded barangays"}. Latest record per account; ${report.duplicateRecords} duplicate account records excluded. Legally distinct statuses remain separate.`,
            }}
            asOf={report.reportDate}
          />
          <article className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="font-bold">Monthly boarder activity</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="label text-xs">
                Boarding year
                <select
                  className="input mt-1"
                  value={year}
                  onChange={(e) => {
                    setYear(Number(e.target.value));
                    if (compare === e.target.value) setCompare("");
                  }}
                >
                  {years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label className="label text-xs">
                Compare year
                <select
                  className="input mt-1"
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                >
                  <option value="">No comparison</option>
                  {years
                    .filter((y) => y !== year)
                    .map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                </select>
              </label>
              <label className="label text-xs">
                Boarding measure
                <select
                  className="input mt-1"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                >
                  <option value="both">New and active</option>
                  <option value="new">New boarders</option>
                  <option value="active">Active boarders</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              {peak > 0
                ? `New boarder activity peaked in ${peakMonths.join(", ")}: ${peak} distinct accounts per peak month.`
                : "No new boarder starts are recorded in the selected year."}{" "}
              {report.datedStays === 0
                ? "No dated stays are available for this area."
                : ""}
            </p>
            <CountLineChart
              title="Monthly boarder activity"
              labels={months}
              series={series}
              unit="distinct boarders"
            />
            <p className="mt-3 text-xs leading-5 text-slate-600">
              New boarders started a recorded stay in that month. Active
              boarders stayed for at least one day of the month, excluding the
              departure date. Each account counts once per month per measure,
              including repeat or overlapping stays. Counts across months must
              not be summed as unique people. The current month is partial;
              future months are unavailable. Elapsed months without recorded
              activity are zero, not proof of complete census coverage.
              Inquiries are not stored and no search-demand metric is inferred.
            </p>
          </article>
        </div>
      )}
      {report && section === "Predictive" && (
        <ForecastPanel
          years={report.annual}
          reportDate={report.reportDate}
          generatedAt={report.generatedAt}
        />
      )}
    </section>
  );
}
