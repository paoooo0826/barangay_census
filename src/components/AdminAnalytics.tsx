import { DescriptiveFindings, MonthlyDiagnostic } from "./AnalyticsFindings";
import CensusYearInsights from "./CensusYearInsights";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  House,
  RefreshCw,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  analyticsNumber as number,
  analyticsMoney as money,
  validAnalyticsData,
} from "../lib/analytics";
import type { AnalyticsData } from "../lib/analytics";
import { ActivityChartCard, AnalyticsChartCard } from "./AnalyticsCharts";
export { AnalyticsChartCard } from "./AnalyticsCharts";
export type { AnalyticsChart } from "../lib/analytics";

const overviewTitles = [
  "Residents by Registration Status",
  "Residents by Sex",
  "Appointments by Status",
];
const findingTitles = [
  "Residents by Age Group",
  "Residents by Sex",
  "Residents by Civil Status",
  "Residents by Highest Education",
  "Service Requests by Type",
];
const activityTitles = [
  "Resident Registrations by Month",
  "Resident Verifications by Month",
  "Service Requests by Month",
  "Receipt-Backed Completions by Month",
];
function PlanningNotes({ insights }: { insights: AnalyticsData["insights"] }) {
  if (!insights.length) return null;
  const ordered = [...insights].sort(
    (a, b) =>
      Number(b.count > 0) - Number(a.count > 0) ||
      Number(/Queue$/.test(b.title)) - Number(/Queue$/.test(a.title)),
  );
  const measures: Record<string, string> = {
    "Census Review Queue":
      "Track how many applications are reviewed and how many remain pending at the next review.",
    "Accepted Service Queue":
      "Track receipt-backed completions and the number still accepted at the next review.",
    "Senior Program Planning":
      "Confirm eligible residents before outreach, then track how many were contacted and served.",
    "Youth Program Planning":
      "Confirm eligible residents and compare program signups with available slots.",
    "PWD Assistance Planning":
      "Confirm assistance needs with residents and track which requests were addressed.",
  };
  return (
    <details
      open
      className="rounded-2xl border border-pine-200 bg-pine-50/60 p-5"
    >
      <summary className="w-fit cursor-pointer rounded text-sm font-bold text-pine-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        Planning Notes{" "}
        <span className="ml-1 text-xs font-normal">({insights.length})</span>
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Rule-based decision support from current totals; confirm coverage and
        eligibility before planning services.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {ordered.map((insight) => (
          <article
            key={insight.title}
            className="rounded-xl border border-pine-100 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold">{insight.title}</h3>
              <span className="shrink-0 rounded-full bg-pine-50 px-2 py-1 text-xs font-bold text-pine-800">
                {insight.denominator
                  ? `${((insight.count / insight.denominator) * 100).toFixed(1)}%`
                  : "No baseline"}
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-pine-800">
              {number.format(insight.count)}{" "}
              <span className="text-xs font-normal text-slate-500">
                of {number.format(insight.denominator)}
              </span>
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {insight.interpretation}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              <strong>Next step: </strong>
              {insight.count > 0
                ? insight.suggestion
                : "Check the filter and record coverage before assigning follow-up. No matching records are shown."}
            </p>
            {insight.count > 0 && (
              <p className="mt-2 text-xs leading-5 text-slate-600">
                <strong>How to check progress: </strong>
                {measures[insight.title] ??
                  "Record the baseline and compare it with the same measure after taking action."}
              </p>
            )}
          </article>
        ))}
      </div>
    </details>
  );
}
export default function AdminAnalytics({
  refreshKey,
}: {
  refreshKey?: number;
}) {
  const [result, setResult] = useState<{
      key: string;
      data: AnalyticsData;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState("all"),
    [section, setSection] = useState("Descriptive"),
    [reload, setReload] = useState(0);
  const generation = useRef(0),
    filterKey = JSON.stringify([from, to, status]);
  const data = result?.key === filterKey ? result.data : null;
  useEffect(() => {
    let active = true;
    const read = async () => {
      const request = ++generation.current;
      if (from && to && from > to) {
        setError("The start date must precede the end date.");
        setResult(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await supabase.rpc("admin_system_analytics", {
          p_from: from || null,
          p_to: to || null,
          p_status: status,
        });
        if (!active || request !== generation.current) return;
        if (response.error) throw response.error;
        if (!validAnalyticsData(response.data))
          throw new Error(
            "Analytics returned an incomplete report. Please refresh to try again.",
          );
        setResult({ key: filterKey, data: response.data });
        setError("");
      } catch (caught) {
        if (active && request === generation.current) {
          setResult(null);
          setError(
            caught && typeof caught === "object" && "message" in caught
              ? String(caught.message)
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
    }, 60000);
    return () => {
      active = false;
      ++generation.current;
      window.clearInterval(timer);
    };
  }, [from, to, status, filterKey, refreshKey, reload]);
  const sections = ["Descriptive", "Diagnostic", "Predictive", "Prescriptive"];
  const activeSection = section;
  const [category, setCategory] = useState("Overview");
  const categories = [
    ...new Set((data?.charts ?? []).map((chart) => chart.section)),
  ];
  const byTitle = new Map(
    (data?.charts ?? []).map((chart) => [chart.title, chart]),
  );
  const activity = activityTitles.flatMap((title) =>
    byTitle.has(title) ? [byTitle.get(title)!] : [],
  );
  const selectedCharts = (data?.charts ?? []).filter(
    (chart) => chart.section === category,
  );
  const verified =
    data?.verifiedResidents ??
    byTitle
      .get("Residents by Registration Status")
      ?.rows.find((row) => row.label === "verified")?.count ??
    0;
  const period =
    from || to
      ? `${from || "Earliest record"} – ${to || "Latest record"}`
      : "All recorded dates";
  return (
    <section className="space-y-5" aria-label="Barangay analytics dashboard">
      <header className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-pine-600">
            <BarChart3 size={14} aria-hidden="true" />
            Data & Insights
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Barangay Analytics
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            A clear view of registered residents, barangay services and
            community activity.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] leading-5 text-slate-500">
            Reporting Date
            <strong className="block font-semibold text-slate-700">
              {data?.reportDate || (error ? "Unavailable" : "Loading report")} ·
              Asia/Manila
            </strong>
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => setReload((n) => n + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-pine-800 shadow-sm disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : ""}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_auto]">
          <label className="label text-xs">
            Activity From
            <input
              aria-label="Activity From"
              type="date"
              className="input mt-1.5 min-h-12 min-w-0 w-full"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="label text-xs">
            Activity Through
            <input
              aria-label="Activity Through"
              type="date"
              className="input mt-1.5 min-h-12 min-w-0 w-full"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="label text-xs">
            Resident Status
            <select
              aria-label="Resident Status"
              className="input mt-1.5 min-h-12 min-w-0 w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {[
                ["all", "All Statuses"],
                ["verified", "Verified"],
                ["pending_review", "Pending Review"],
                ["returned", "Legacy Returned"],
                ["rejected", "Rejected"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!from && !to && status === "all"}
            onClick={() => {
              setFrom("");
              setTo("");
              setStatus("all");
            }}
            className="min-h-11 rounded-xl px-3 text-xs font-semibold text-pine-700 underline underline-offset-4 disabled:text-slate-400 disabled:no-underline"
          >
            Reset Filters
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
          <span>
            <strong className="font-semibold text-slate-700">
              Activity period:
            </strong>{" "}
            {period}
          </span>
          <span>
            Dates filter activity, annual submissions, and collected payments.
            Current totals stay unchanged.
          </span>
          <span>
            Resident status filters resident and verification statistics.
          </span>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}{" "}
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="ml-2 font-bold underline"
          >
            Retry
          </button>
        </p>
      )}
      {loading && (
        <p role="status" className="text-xs text-slate-500">
          {data ? "Updating analytics…" : "Loading analytics…"}
        </p>
      )}
      {data && (
        <>
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Analytics summary"
          >
            {[
              {
                label: "Registered Accounts",
                value: number.format(data.residentTotal),
                note: "Latest record per account · Current cohort",
                icon: Users,
              },
              {
                label: "Verified Residents",
                value: number.format(verified),
                note: `${data.residentTotal ? ((verified / data.residentTotal) * 100).toFixed(1) : "0.0"}% of the selected resident cohort (${number.format(verified)} of ${number.format(data.residentTotal)})`,
                icon: CheckCircle2,
              },
              {
                label: "Distinct Address Groups",
                value: number.format(data.addressGroups),
                note: "Reported addresses · Not household totals",
                icon: House,
              },
              {
                label: "Posted Cash Payments",
                value: money.format(data.postedPayments),
                note: "Collected payments · Activity period",
                icon: CircleDollarSign,
              },
            ].map(({ label, value, note, icon: Icon }) => (
              <article
                key={label}
                className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-600">
                    {label}
                  </h3>
                  <span className="rounded-lg bg-pine-50 p-2 text-pine-600">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 break-words text-2xl font-bold tabular-nums tracking-tight text-pine-900">
                  {value}
                </p>
                <p className="mt-2 text-[10px] leading-4 text-slate-500">
                  {note}
                </p>
              </article>
            ))}
          </div>
          <nav
            aria-label="Analytics sections"
            className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
          >
            {sections.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={name === activeSection}
                onClick={() => setSection(name)}
                className={`min-h-10 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${name === activeSection ? "bg-pine-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {name}
              </button>
            ))}
          </nav>
          {data.legacyCompletions > 0 && (
            <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              {data.legacyCompletions} historical appointments marked Completed
              lack linked receipts and are excluded from receipt-backed
              completion totals.{" "}
              <a
                className="font-semibold underline"
                href="#/admin/dashboard?tab=legacy"
              >
                Review Reconciliation
              </a>
            </p>
          )}
          <h3 className="text-lg font-bold">{activeSection} Analytics</h3>
          {activeSection === "Descriptive" && (
            <>
              <label className="label block max-w-sm">
                Statistics group
                <select
                  className="input mt-1"
                  aria-label="Statistics group"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {["Overview", ...categories].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <DescriptiveFindings
                charts={
                  category === "Overview"
                    ? data.charts.filter((chart) =>
                        findingTitles.includes(chart.title),
                      )
                    : selectedCharts
                }
                data={data}
                period={period}
              />
              {category === "Overview" ? (
                <div className="space-y-4">
                  <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {overviewTitles.flatMap((title) =>
                      byTitle.has(title)
                        ? [
                            <AnalyticsChartCard
                              period={period}
                              asOf={data.reportDate}
                              key={title}
                              chart={byTitle.get(title)!}
                              kind="donut"
                            />,
                          ]
                        : [],
                    )}
                  </div>
                  <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
                    <ActivityChartCard charts={activity} period={period} />
                    {byTitle.has("Service Requests by Type") && (
                      <AnalyticsChartCard
                        period={period}
                        asOf={data.reportDate}
                        chart={byTitle.get("Service Requests by Type")!}
                      />
                    )}
                  </div>
                  <div className="grid items-stretch gap-4 lg:grid-cols-2">
                    {[
                      "Residents by Age Group",
                      "Residents by Selected Category",
                    ].flatMap((title) =>
                      byTitle.has(title)
                        ? [
                            <AnalyticsChartCard
                              period={period}
                              asOf={data.reportDate}
                              key={title}
                              chart={byTitle.get(title)!}
                            />,
                          ]
                        : [],
                    )}
                  </div>
                  {!data.charts.length && (
                    <p className="rounded-2xl border bg-white p-6 text-sm text-slate-500">
                      No analytics records are available yet. Statistics will
                      appear as records are added.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {selectedCharts.map((chart) => (
                    <AnalyticsChartCard
                      period={period}
                      asOf={data.reportDate}
                      key={chart.title}
                      chart={chart}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          {(activeSection === "Diagnostic" ||
            activeSection === "Predictive") && (
            <CensusYearInsights
              years={
                status === "all" || status === "verified"
                  ? (data.censusYears ?? [])
                  : []
              }
              period={period}
              reportYear={Number(data.reportDate?.slice(0, 4))}
              diagnostic={activeSection === "Diagnostic"}
              filtered={Boolean(from || to || status !== "all")}
            />
          )}
          {activeSection === "Diagnostic" && (
            <MonthlyDiagnostic
              charts={activity}
              reportDate={data.reportDate}
              from={from}
              to={to}
            />
          )}
          {activeSection === "Prescriptive" && (
            <>
              <p className="text-sm text-slate-600">
                Actions below use the selected resident cohort or the explicitly
                labeled current service queue. Area participation rates require
                reliable eligible-resident counts, which are not recorded.
              </p>
              {(data.insights ?? []).length ? (
                <PlanningNotes insights={data.insights} />
              ) : (
                <p>
                  No evidence-backed actions are available for this selection.
                </p>
              )}
            </>
          )}
          <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-500">
            <summary className="w-fit cursor-pointer rounded font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
              About These Statistics & Data Quality
            </summary>
            <div className="mt-3 space-y-2 leading-6">
              <p>
                <strong className="text-slate-700">
                  {number.format(data.duplicateRecords)} duplicate account
                  records excluded.
                </strong>{" "}
                Resident charts use the latest record per account. Missing
                values are shown explicitly. Occupations are grouped to avoid
                displaying personal free text.
              </p>
              <p>
                Registered accounts are not a verified count of the entire
                barangay population. All review and residency statuses are
                included unless filtered; current residency is shown separately.
                Registration activity does not prove population growth.
              </p>
              <p>
                Address groups are not verified household counts: the database
                has no independent household identifier. Category counts can
                exceed the resident total because a resident may select several
                categories.
              </p>
              <p>
                No names, contact details, addresses or ID images are included
                in this dashboard. Activity counts use recorded dates in
                Asia/Manila. Date filters apply to activity charts and posted
                cash payments; current totals are snapshots.
              </p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
