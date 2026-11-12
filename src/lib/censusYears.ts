export interface CensusYear {
  year: number;
  count: number | null;
  coverage: "complete" | "partial" | "unconfirmed" | "missing";
  age: Record<string, number>;
}

export function censusYearChange(
  previous: CensusYear | undefined,
  current: CensusYear,
) {
  if (
    !previous ||
    previous.year !== current.year - 1 ||
    previous.coverage !== "complete" ||
    current.coverage !== "complete" ||
    previous.count == null ||
    current.count == null
  )
    return null;
  const count = current.count - previous.count;
  return {
    count,
    percent: previous.count > 0 ? (count / previous.count) * 100 : null,
  };
}

export function projectCensusYears(years: CensusYear[], reportYear: number) {
  const recent = years.filter((row) => row.year < reportYear).slice(-3);
  if (
    recent.length !== 3 ||
    recent[2].year !== reportYear - 1 ||
    !censusYearChange(recent[0], recent[1]) ||
    !censusYearChange(recent[1], recent[2])
  )
    return null;
  const slope = (recent[2].count! - recent[0].count!) / 2;
  const year = reportYear + 1;
  const yearsAhead = year - recent[2].year;
  const scenarios = [
    recent[1].count! - recent[0].count!,
    recent[2].count! - recent[1].count!,
  ].map((change) =>
    Math.max(0, Math.round(recent[2].count! + change * yearsAhead)),
  );
  return {
    year,
    yearsAhead,
    slope,
    scenarioLow: Math.min(...scenarios),
    scenarioHigh: Math.max(...scenarios),
    count: Math.max(0, Math.round(recent[2].count! + slope * yearsAhead)),
    from: recent[0].year,
    to: recent[2].year,
  };
}
