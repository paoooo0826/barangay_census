import { chartRows, type AnalyticsChart } from "./analytics";

export function observedMonthlyChange(
  chart: AnalyticsChart,
  reportDate: string,
  from: string,
  to: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null;
  const rows = chartRows(chart)
    .filter(({ label }) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(label)) return false;
      const [year, month] = label.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const end = `${label}-${lastDay}`;
      return (
        end < reportDate &&
        (!from || from <= `${label}-01`) &&
        (!to || end <= to)
      );
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  const [previous, current] = rows.slice(-2);
  if (!previous || !current) return null;
  const index = (label: string) =>
    Number(label.slice(0, 4)) * 12 + Number(label.slice(5));
  if (index(current.label) !== index(previous.label) + 1) return null;
  return { previous, current, delta: current.count - previous.count };
}

export function ageGroupChanges(
  previous: Record<string, number>,
  current: Record<string, number>,
) {
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .map((label) => {
      const before = previous[label] ?? 0,
        after = current[label] ?? 0;
      return { label, before, after, delta: after - before };
    })
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label),
    );
}
