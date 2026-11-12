import { useEffect, useId, useMemo, useRef, useState } from "react";
import { analyticsLabel } from "../lib/displayLabels";
import {
  analyticsColors as colors,
  analyticsNumber as number,
  chartRows,
  monthlySeries,
  monthLabel,
} from "../lib/analytics";
import type { AnalyticsChart } from "../lib/analytics";

function DataTable({ chart }: { chart: AnalyticsChart }) {
  return (
    <details className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
      <summary className="w-fit cursor-pointer rounded font-semibold text-pine-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        View Data
      </summary>
      <div
        className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200"
        tabIndex={0}
        role="region"
        aria-label={`${chart.title} data`}
      >
        <table className="w-full text-left">
          <caption className="sr-only">
            {chart.title} — {chart.unit}
          </caption>
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th scope="col" className="px-3 py-2">
                Category
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {analyticsLabel(chart.unit)}
              </th>
            </tr>
          </thead>
          <tbody>
            {chartRows(chart).map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <th scope="row" className="px-3 py-2 font-normal">
                  {monthLabel(analyticsLabel(row.label))}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {number.format(row.count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
function Donut({ chart }: { chart: AnalyticsChart }) {
  const rows = chartRows(chart),
    total = rows.reduce((sum, r) => sum + r.count, 0);
  const [active, setActive] = useState<string | null>(null);
  let offset = 0;
  return (
    <>
      <div className="relative mx-auto my-3 w-44 max-w-full">
        <svg
          viewBox="0 0 180 180"
          role="img"
          aria-label={`${chart.title}: ${number.format(total)} ${chart.unit}`}
          className="aspect-square w-full"
        >
          <circle
            cx="90"
            cy="90"
            r="68"
            fill="none"
            stroke="#eff2ed"
            strokeWidth="23"
          />
          <g transform="rotate(-90 90 90)">
            {rows.map((row, i) => {
              const start = offset,
                length = (row.count / total) * 100;
              offset += length;
              if (!row.count) return null;
              return (
                <circle
                  key={row.label}
                  cx="90"
                  cy="90"
                  r="68"
                  fill="none"
                  pathLength="100"
                  stroke={colors[i % colors.length]}
                  strokeWidth={active === row.label ? 27 : 23}
                  strokeDasharray={`${length} ${100 - length}`}
                  strokeDashoffset={-start}
                  onMouseEnter={() => setActive(row.label)}
                  onMouseLeave={() => setActive(null)}
                >
                  <title>{`${analyticsLabel(row.label)}: ${number.format(row.count)} of ${number.format(total)} (${((row.count / total) * 100).toFixed(1)}%)`}</title>
                </circle>
              );
            })}
          </g>
          <text
            x="90"
            y="91"
            textAnchor="middle"
            fill="#1c302c"
            fontWeight="700"
            fontSize={number.format(total).length > 6 ? 23 : 30}
          >
            {number.format(total)}
          </text>
          <text x="90" y="112" textAnchor="middle" fill="#657369" fontSize="11">
            Total {chart.unit}
          </text>
        </svg>
      </div>
      <ul
        className="max-h-44 space-y-1 overflow-y-auto"
        aria-label={`${chart.title} legend`}
      >
        {rows.map((row, i) => (
          <li key={row.label}>
            <button
              type="button"
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine-600 ${active === row.label ? "bg-slate-100" : "hover:bg-slate-50"}`}
              onMouseEnter={() => setActive(row.label)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(row.label)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === row.label ? null : row.label)}
              aria-label={`${analyticsLabel(row.label)}: ${number.format(row.count)} of ${number.format(total)} ${chart.unit}, ${((row.count / total) * 100).toFixed(1)} percent`}
            >
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-sm"
                style={{ background: colors[i % colors.length] }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 break-words">
                {analyticsLabel(row.label)}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-slate-800">
                {number.format(row.count)}
              </span>
              <span className="w-11 shrink-0 text-right tabular-nums text-slate-500">
                {((row.count / total) * 100).toFixed(1)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
function Bars({ chart }: { chart: AnalyticsChart }) {
  const rows = chartRows(chart),
    max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div
      className="mt-5 max-h-80 overflow-y-auto pr-1"
      tabIndex={0}
      role="region"
      aria-label={`${chart.title} bars`}
    >
      <ul className="space-y-4">
        {rows.map((row, i) => (
          <li
            key={row.label}
            title={`${analyticsLabel(row.label)}: ${number.format(row.count)} ${chart.unit}`}
          >
            <div className="mb-1.5 flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0 break-words text-slate-600">
                {analyticsLabel(row.label)}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-slate-900">
                {number.format(row.count)}
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-sm bg-slate-100"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${(row.count / max) * 100}%`,
                  background: colors[i % colors.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div
        className="mt-4 flex justify-between text-[10px] tabular-nums text-slate-500"
        aria-hidden="true"
      >
        <span>0</span>
        <span>
          Maximum {number.format(max)} {chart.unit}
        </span>
      </div>
    </div>
  );
}
export function TrendPlot({ charts }: { charts: AnalyticsChart[] }) {
  const { months, series, sparse, monthIndex } = useMemo(
    () => monthlySeries(charts),
    [charts],
  );
  const [selected, setSelected] = useState<string | null>(null),
    [hidden, setHidden] = useState<string[]>([]);
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const element = plot.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, Math.floor(entry.contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [months.length, hidden.length]);
  const right = width - 42;
  const span = right - 44;
  const id = useId(),
    month = selected && months.includes(selected) ? selected : months.at(-1);
  const visible = series.filter((s) => !hidden.includes(s.title));
  const total = visible.reduce(
    (sum, s) => sum + [...s.values.values()].reduce((sum, n) => sum + n, 0),
    0,
  );
  const maximum = Math.max(
    1,
    ...visible.flatMap((s) => [...s.values.values()]),
  );
  const top = Math.ceil(maximum / 4) * 4;
  const x = (key: string) =>
    months.length === 1
      ? width / 2
      : 44 +
        ((monthIndex(key) - monthIndex(months[0])) /
          Math.max(1, monthIndex(months.at(-1)!) - monthIndex(months[0]))) *
          span;
  const y = (count: number) => 198 - (count / top) * 162;
  return (
    <>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {series.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-pressed={!hidden.includes(s.title)}
            className={`flex items-center gap-1.5 rounded text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-600 ${hidden.includes(s.title) ? "text-slate-400 line-through" : "text-slate-600"}`}
            onClick={() =>
              setHidden((previous) =>
                previous.includes(s.title)
                  ? previous.filter((title) => title !== s.title)
                  : [...previous, s.title],
              )
            }
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colors[i % colors.length] }}
              aria-hidden="true"
            />
            {s.title.replace(/ by Month$/, "")}
          </button>
        ))}
      </div>
      {!months.length || total === 0 ? (
        <p className="my-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
          {!visible.length
            ? "Select a series above to display its activity."
            : "No dated activity available for this statistic in the selected period."}
        </p>
      ) : (
        <>
          <div
            ref={plot}
            className="min-w-0 max-w-full"
            role="region"
            aria-label="Monthly activity plot"
            tabIndex={0}
          >
            <svg
              viewBox={`0 0 ${width} 235`}
              role="img"
              aria-labelledby={`${id}-title ${id}-description`}
              className="mt-4 block w-full"
              style={{ height: 235 }}
            >
              <title id={`${id}-title`}>Monthly Activity</title>
              <desc id={`${id}-description`}>
                Counts per calendar month. Use the legend to show or hide a
                series and the month selector below to read exact values.
              </desc>
              {[0, 1, 2, 3, 4].map((i) => (
                <g key={i}>
                  <line
                    x1="44"
                    x2={right}
                    y1={y((top / 4) * i)}
                    y2={y((top / 4) * i)}
                    stroke="#e2e7de"
                    strokeDasharray={i ? "3 5" : undefined}
                  />
                  <text
                    x="36"
                    y={y((top / 4) * i) + 4}
                    textAnchor="end"
                    fontSize="12"
                    fill="#657369"
                  >
                    {new Intl.NumberFormat("en-PH", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format((top / 4) * i)}
                  </text>
                </g>
              ))}
              {series.map((s, i) => {
                if (hidden.includes(s.title)) return null;
                const points = months
                  .map((m) => `${x(m)},${y(s.values.get(m) ?? 0)}`)
                  .join(" ");
                return (
                  <g key={s.title}>
                    <polygon
                      points={`${x(months[0])},198 ${points} ${x(months.at(-1)!)},198`}
                      fill={colors[i % colors.length]}
                      opacity="0.1"
                    />
                    <polyline
                      points={points}
                      fill="none"
                      stroke={colors[i % colors.length]}
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    {months.length <= 60 &&
                      months.map((m) => (
                        <circle
                          key={m}
                          cx={x(m)}
                          cy={y(s.values.get(m) ?? 0)}
                          r={m === month ? 4.5 : 3}
                          fill={colors[i % colors.length]}
                          stroke="white"
                          strokeWidth="1.5"
                        >
                          <title>{`${monthLabel(m)} · ${s.title}: ${number.format(s.values.get(m) ?? 0)} ${s.unit}`}</title>
                        </circle>
                      ))}
                  </g>
                );
              })}
              {month && (
                <line
                  x1={x(month)}
                  x2={x(month)}
                  y1="30"
                  y2="198"
                  stroke="#829187"
                  strokeDasharray="3 4"
                />
              )}
              {months
                .filter(
                  (_, i) =>
                    i === 0 ||
                    i === months.length - 1 ||
                    (width >= 520 &&
                      months.length > 3 &&
                      i % Math.ceil(months.length / 5) === 0 &&
                      i < months.length - 2),
                )
                .map((m) => (
                  <text
                    key={m}
                    x={x(m)}
                    y="221"
                    textAnchor="middle"
                    fontSize="12"
                    fill="#657369"
                  >
                    {monthLabel(m)}
                  </text>
                ))}
              {months.map((m, i) => (
                <rect
                  key={m}
                  x={i === 0 ? 44 : (x(months[i - 1]) + x(m)) / 2}
                  y="30"
                  width={Math.max(
                    8,
                    (i === months.length - 1
                      ? right
                      : (x(m) + x(months[i + 1])) / 2) -
                      (i === 0 ? 44 : (x(months[i - 1]) + x(m)) / 2),
                  )}
                  height="168"
                  fill="transparent"
                  onMouseEnter={() => setSelected(m)}
                  onClick={() => setSelected(m)}
                  aria-hidden="true"
                />
              ))}
            </svg>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
            <label className="font-semibold text-slate-600">
              Inspect Month
              <select
                aria-label="Inspect activity month"
                className="ml-2 max-w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
                value={month}
                onChange={(e) => setSelected(e.target.value)}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <output
              className="flex flex-wrap gap-x-4 gap-y-2"
              aria-live="polite"
            >
              {visible.map((s) => (
                <span key={s.title} className="text-slate-600">
                  {analyticsLabel(s.unit)}{" "}
                  <strong className="ml-1 text-slate-900">
                    {number.format(s.values.get(month!) ?? 0)}
                  </strong>
                </span>
              ))}
            </output>
          </div>
        </>
      )}
      {series.some((s) => s.undated > 0) && (
        <p className="mt-3 text-xs text-amber-800">
          {number.format(series.reduce((sum, s) => sum + s.undated, 0))} records
          without a valid month are excluded from the timeline; they remain in
          View Data.
        </p>
      )}
      {sparse && (
        <p className="mt-3 text-xs text-slate-500">
          For histories longer than 100 years, only recorded months are shown
          with calendar spacing.
        </p>
      )}
    </>
  );
}
export function AnalyticsChartCard({
  chart,
  kind,
  className = "",
  period,
  asOf,
}: {
  chart: AnalyticsChart;
  kind?: string;
  className?: string;
  period?: string;
  asOf?: string;
}) {
  const total = chartRows(chart).reduce((sum, row) => sum + row.count, 0),
    view = kind ?? chart.kind;
  return (
    <article
      className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
      aria-label={chart.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold leading-5 text-slate-900">
            {chart.title}
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {chart.period
              ? `Activity · ${period ?? "selected period"}`
              : `Current totals${asOf ? ` · ${asOf}` : ""}`}
          </p>
        </div>
        {view !== "donut" && (
          <span className="shrink-0 text-right text-lg font-bold tabular-nums text-pine-800">
            {number.format(total)}
            <span className="block text-[10px] font-normal text-slate-500">
              {chart.unit}
            </span>
          </span>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        {total
          ? `This breakdown shows ${number.format(total)} ${chart.unit} ${chart.period ? "in the selected activity period" : "in the current selection"}.`
          : `No ${chart.unit} are recorded for this selection.`}
        {total > 0 &&
          view !== "trend" &&
          (() => {
            const largest = [...chartRows(chart)].sort(
              (a, b) => b.count - a.count,
            )[0];
            return ` The largest group is ${analyticsLabel(largest.label)} (${number.format(largest.count)} of ${number.format(total)} ${chart.unit}).`;
          })()}
      </p>
      {chart.note && (
        <p className="mt-3 text-xs leading-5 text-slate-600">{chart.note}</p>
      )}
      {total === 0 ? (
        <p className="my-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
          No records available for this statistic.
        </p>
      ) : view === "donut" ? (
        <Donut chart={chart} />
      ) : view === "trend" ? (
        <TrendPlot charts={[chart]} />
      ) : (
        <Bars chart={chart} />
      )}
      <DataTable chart={chart} />
    </article>
  );
}
export function ActivityChartCard({
  charts,
  period,
}: {
  charts: AnalyticsChart[];
  period?: string;
}) {
  if (!charts.length) return null;
  return (
    <article
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label="Monthly Activity Overview"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Monthly Activity Overview
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Activity · {period ?? "selected period"} · Count per month
          </p>
        </div>
        <span className="rounded-full bg-pine-50 px-2.5 py-1 text-[10px] font-semibold text-pine-700">
          Registrations, verifications & services
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Counts by month in the selected activity period:{" "}
        {charts
          .map(
            (chart) =>
              `${number.format(chartRows(chart).reduce((sum, row) => sum + row.count, 0))} ${chart.unit}`,
          )
          .join(", ")}
        . Select a month for exact counts; these measures describe different
        activities and are not added together.
      </p>
      <TrendPlot charts={charts} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        {charts.map((chart) => (
          <DataTable key={chart.title} chart={chart} />
        ))}
      </div>
    </article>
  );
}
