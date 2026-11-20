import type { CensusYear } from "./censusYears";
export interface ForecastPoint {
  year: number;
  count: number;
}
export function forecastAnnual(
  years: CensusYear[],
  reportYear: number,
  horizon: number,
) {
  if (![1, 3, 5].includes(horizon) || !Number.isInteger(reportYear))
    return null;
  const sorted = [...years].sort((a, b) => a.year - b.year);
  if (new Set(sorted.map((r) => r.year)).size !== sorted.length) return null;
  const recent: CensusYear[] = [];
  for (let year = reportYear - 1; recent.length < 10; year--) {
    const row = sorted.find((r) => r.year === year);
    if (
      !row ||
      row.coverage !== "complete" ||
      row.count == null ||
      !Number.isSafeInteger(row.count) ||
      row.count < 0
    )
      break;
    recent.unshift(row);
  }
  // Three years train each rolling-origin test; at least one held-out year.
  if (recent.length < 4) return null;
  const fit = (rows: CensusYear[], target: number) => {
    const base = rows[0].year,
      n = rows.length;
    const meanX = rows.reduce((s, r) => s + r.year - base, 0) / n;
    const meanY = rows.reduce((s, r) => s + r.count!, 0) / n;
    const slope =
      rows.reduce(
        (s, r) => s + (r.year - base - meanX) * (r.count! - meanY),
        0,
      ) / rows.reduce((s, r) => s + (r.year - base - meanX) ** 2, 0);
    return Math.max(0, Math.round(meanY + slope * (target - base - meanX)));
  };
  const validation = recent
    .slice(3)
    .map((row, i) => ({
      year: row.year,
      actual: row.count!,
      predicted: fit(recent.slice(0, i + 3), row.year),
    }));
  const mae =
    validation.reduce((s, r) => s + Math.abs(r.actual - r.predicted), 0) /
    validation.length;
  const nonzero = validation.filter((r) => r.actual > 0);
  const mape = nonzero.length
    ? nonzero.reduce(
        (s, r) => s + (Math.abs(r.actual - r.predicted) / r.actual) * 100,
        0,
      ) / nonzero.length
    : null;
  const last = recent.at(-1)!;
  return {
    from: recent[0].year,
    to: last.year,
    training: recent,
    validation,
    mae,
    mape,
    mapeYears: nonzero.length,
    points: Array.from({ length: horizon }, (_, i) => ({
      year: last.year + i + 1,
      count: fit(recent, last.year + i + 1),
    })),
  };
}
