import {
  analyticsNumber as number,
  chartRows,
  monthLabel,
  type AnalyticsChart,
  type AnalyticsData,
} from "../lib/analytics";
import { observedMonthlyChange } from "../lib/analyticsInsights";
import { analyticsLabel } from "../lib/displayLabels";

export function DescriptiveFindings({
  charts,
  data,
  period,
}: {
  charts: AnalyticsChart[];
  data: AnalyticsData;
  period: string;
}) {
  const findings = charts
    .flatMap((chart) => {
      const rows = chartRows(chart),
        total = rows.reduce((sum, row) => sum + row.count, 0);
      if (!total) return [];
      const maximum = Math.max(...rows.map((row) => row.count));
      return [
        {
          chart,
          total,
          maximum,
          leaders: rows.filter((row) => row.count === maximum),
        },
      ];
    })
    .slice(0, 5);
  return (
    <section
      aria-label="Key findings"
      className="rounded-2xl border border-pine-200 bg-pine-50/60 p-4"
    >
      <h4 className="font-bold">What stands out</h4>
      <p className="mt-1 text-sm text-slate-600">
        {number.format(data.residentTotal)} distinct accounts in the selected
        census cohort. This is the count of recorded respondents, not the
        barangay population.
      </p>
      {findings.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {findings.map(({ chart, total, maximum, leaders }) => (
            <li
              key={chart.title}
              className="min-w-0 break-words rounded-lg bg-white p-3 text-sm"
            >
              <strong>{chart.title}</strong>
              <p>
                {leaders
                  .map((row) => monthLabel(analyticsLabel(row.label)))
                  .join(", ")}{" "}
                {leaders.length === 1 ? "has" : "are tied at"}{" "}
                {number.format(maximum)} of {number.format(total)}{" "}
                {chart.title === "Residents by Selected Category"
                  ? "category selections"
                  : chart.unit}{" "}
                ({((maximum / total) * 100).toFixed(1)}%
                {leaders.length > 1 ? " each" : ""}).
              </p>
              <p className="text-xs text-slate-500">
                {chart.period ? period : `Current records · ${data.reportDate}`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm">
          No breakdowns have recorded values for this selection.
        </p>
      )}
    </section>
  );
}

export function MonthlyDiagnostic({
  charts,
  reportDate,
  from,
  to,
}: {
  charts: AnalyticsChart[];
  reportDate: string;
  from: string;
  to: string;
}) {
  const changes = charts.flatMap((chart) => {
    const change = observedMonthlyChange(chart, reportDate, from, to);
    return change ? [{ chart, ...change }] : [];
  });
  return (
    <article className="min-w-0 rounded-2xl border bg-white p-5">
      <h4 className="font-bold">Recent recorded activity</h4>
      <p className="mt-1 text-sm text-slate-600">
        Each measure compares its latest two consecutive, fully elapsed months
        with recorded counts in the selected period. Missing months are not
        treated as zero. Changes describe recorded activity and do not explain
        why it changed.
      </p>
      {changes.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {changes.map(({ chart, previous, current, delta }) => (
            <li key={chart.title} className="rounded-lg bg-slate-50 p-3">
              <strong>{chart.title}</strong>
              <p>
                {monthLabel(previous.label)}: {number.format(previous.count)} →{" "}
                {monthLabel(current.label)}: {number.format(current.count)}{" "}
                {chart.unit}.{" "}
                {delta === 0
                  ? "No change."
                  : `${delta > 0 ? "+" : ""}${number.format(delta)} ${chart.unit}.`}{" "}
                {previous.count > 0
                  ? `Percentage change: ${((delta / previous.count) * 100).toFixed(1)}% (base: ${number.format(previous.count)}).`
                  : "Percentage change is unavailable from a zero baseline."}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">
          No comparable recorded months in this selection. Try a wider activity
          period.
        </p>
      )}
    </article>
  );
}
