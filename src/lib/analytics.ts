import type { CensusYear } from "./censusYears";
export interface AnalyticsChart {
  section: string;
  title: string;
  unit: string;
  period: boolean;
  kind: string;
  note?: string;
  rows: { label: string; count: number }[];
}
export interface AnalyticsData {
  residentTotal: number;
  recordTotal: number;
  duplicateRecords: number;
  addressGroups: number;
  postedPayments: number;
  charts: AnalyticsChart[];
  reportDate: string;
  censusYears?: CensusYear[];
  verifiedResidents: number;
  legacyCompletions: number;
  insights: {
    section: string;
    title: string;
    count: number;
    denominator: number;
    interpretation: string;
    suggestion: string;
  }[];
}
export const analyticsNumber = new Intl.NumberFormat("en-PH");
export const analyticsMoney = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});
export const analyticsColors = [
  "#287b78",
  "#839b52",
  "#dfa45a",
  "#cc7474",
  "#648ea5",
  "#897999",
  "#85918b",
  "#b58a63",
  "#4f7e65",
];
export function chartRows(chart: AnalyticsChart) {
  const rows = new Map<string, number>();
  for (const row of chart.rows) {
    const label = row.label?.trim() || "Not specified";
    const count = Number.isFinite(row.count) && row.count >= 0 ? row.count : 0;
    rows.set(label, (rows.get(label) ?? 0) + count);
  }
  return [...rows].map(([label, count]) => ({ label, count }));
}
const monthIndex = (month: string) =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
export function monthLabel(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? new Intl.DateTimeFormat("en-PH", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${month}-01T00:00:00Z`))
    : month;
}
export function monthlySeries(charts: AnalyticsChart[]) {
  const series = charts.map((chart) => {
    const rows = chartRows(chart);
    return {
      title: chart.title,
      unit: chart.unit,
      values: new Map(
        rows
          .filter((row) => /^\d{4}-(0[1-9]|1[0-2])$/.test(row.label))
          .map((row) => [row.label, row.count]),
      ),
      undated: rows
        .filter((row) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.label))
        .reduce((sum, row) => sum + row.count, 0),
    };
  });
  const observed = [
    ...new Set(series.flatMap((s) => [...s.values.keys()])),
  ].sort();
  const span = observed.length
    ? monthIndex(observed.at(-1)!) - monthIndex(observed[0])
    : 0;
  // Bound rendering for unusually long histories; keep true calendar spacing.
  const sparse = span > 1200;
  const months =
    sparse || !observed.length
      ? observed
      : Array.from({ length: span + 1 }, (_, i) => {
          const index = monthIndex(observed[0]) + i;
          return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
        });
  return { months, series, sparse, monthIndex };
}
export function validAnalyticsData(value: unknown): value is AnalyticsData {
  if (!value || typeof value !== "object") return false;
  const data = value as AnalyticsData;
  return (
    (data.censusYears == null ||
      (Array.isArray(data.censusYears) &&
        data.censusYears.every(
          (row) =>
            row &&
            Number.isInteger(row.year) &&
            row.year >= 1900 &&
            (row.count === null ||
              (Number.isSafeInteger(row.count) && row.count >= 0)) &&
            ["complete", "partial", "unconfirmed", "missing"].includes(
              row.coverage,
            ) &&
            row.age &&
            typeof row.age === "object" &&
            !Array.isArray(row.age) &&
            Object.values(row.age).every(
              (n) => Number.isSafeInteger(n) && n >= 0,
            ),
        ))) &&
    (data.verifiedResidents == null ||
      (Number.isFinite(data.verifiedResidents) &&
        data.verifiedResidents >= 0 &&
        data.verifiedResidents <= data.residentTotal)) &&
    (data.insights == null ||
      (Array.isArray(data.insights) &&
        data.insights.every(
          (insight) =>
            insight &&
            [
              insight.section,
              insight.title,
              insight.interpretation,
              insight.suggestion,
            ].every((s) => typeof s === "string") &&
            [insight.count, insight.denominator].every(
              (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
            ),
        ))) &&
    [
      data.residentTotal,
      data.addressGroups,
      data.duplicateRecords,
      data.postedPayments,
    ].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) &&
    Array.isArray(data.charts) &&
    data.charts.every(
      (chart) =>
        chart &&
        [chart.title, chart.section, chart.unit, chart.kind].every(
          (s) => typeof s === "string",
        ) &&
        typeof chart.period === "boolean" &&
        (chart.note == null || typeof chart.note === "string") &&
        Array.isArray(chart.rows) &&
        chart.rows.every(
          (row) =>
            row &&
            typeof row.label === "string" &&
            typeof row.count === "number" &&
            Number.isFinite(row.count) &&
            row.count >= 0,
        ),
    )
  );
}
