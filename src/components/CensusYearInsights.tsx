import { useState } from "react";
import { ageGroupChanges } from "../lib/analyticsInsights";
import { analyticsNumber as number } from "../lib/analytics";
import {
  censusYearChange,
  projectCensusYears,
  type CensusYear,
} from "../lib/censusYears";

export default function CensusYearInsights({
  years,
  period,
  reportYear,
  diagnostic,
  filtered,
}: {
  years: CensusYear[];
  period: string;
  reportYear: number;
  diagnostic?: boolean;
  filtered: boolean;
}) {
  const [comparisonYear, setComparisonYear] = useState<number | null>(null);
  const comparable = years.filter((row, index) =>
    censusYearChange(years[index - 1], row),
  );
  const latest =
    comparable.find((row) => row.year === comparisonYear) ?? comparable.at(-1);
  const previous = latest && years.find((row) => row.year === latest.year - 1);
  const change = latest && censusYearChange(previous, latest);
  const projection = filtered ? null : projectCensusYears(years, reportYear);
  const signed = (n: number) => (n > 0 ? "+" : "") + number.format(n);
  const max = Math.max(
    1,
    ...years.map((row) => row.count ?? 0),
    projection?.count ?? 0,
  );
  const groups =
    latest && previous ? ageGroupChanges(previous.age, latest.age) : [];
  const groupMax = Math.max(1, ...groups.map((row) => Math.abs(row.delta)));
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-bold">
        {diagnostic
          ? "Where annual changes came from"
          : "Verified census submissions by year"}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        {period} · Asia/Manila · Unique resident accounts currently verified,
        counted once per submission year. Status changes can revise historical
        totals.
      </p>
      {diagnostic && comparable.length > 0 && (
        <label className="label mt-3 block max-w-xs">
          Compare confirmed years
          <select
            className="input mt-1"
            value={latest?.year}
            onChange={(event) => setComparisonYear(Number(event.target.value))}
          >
            {comparable.map((row) => (
              <option key={row.year} value={row.year}>
                {row.year - 1} to {row.year}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="mt-3 text-sm">
        {change && latest && previous
          ? `From ${previous.year} to ${latest.year}, verified submissions ${change.count === 0 ? "were unchanged" : `${change.count > 0 ? "increased" : "decreased"} by ${number.format(Math.abs(change.count))}`} (${number.format(previous.count!)} to ${number.format(latest.count!)}${change.percent === null ? "; percentage unavailable from a zero baseline" : `; ${signed(Number(change.percent.toFixed(1)))}%`}).`
          : "There are no consecutive years with confirmed full coverage in this period. Partial and unconfirmed years are shown without a year-over-year comparison."}
      </p>
      {diagnostic ? (
        <>
          {groups.length > 0 && (
            <ul className="mt-4 space-y-3" aria-label="Age group changes">
              {groups.map((row) => (
                <li key={row.label} className="text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <strong>{row.label}</strong>
                    <span>
                      {number.format(row.before)} → {number.format(row.after)} (
                      {signed(row.delta)})
                    </span>
                  </div>
                  <div
                    className="mt-1 grid grid-cols-2 gap-px"
                    aria-hidden="true"
                  >
                    <div className="flex h-2 justify-end rounded bg-slate-100">
                      {row.delta < 0 && (
                        <div
                          className="rounded bg-amber-600"
                          style={{
                            width: `${(Math.abs(row.delta) / groupMax) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="h-2 rounded bg-slate-100">
                      {row.delta > 0 && (
                        <div
                          className="h-full rounded bg-pine-700"
                          style={{ width: `${(row.delta / groupMax) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {groups.length > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              Age is measured at submission. Bars left of center show decreases;
              bars right of center show increases. Offsetting changes can leave
              the overall total unchanged.
            </p>
          )}
          <p className="mt-3 text-sm text-slate-600">
            These counts can reflect participation, population, verification
            timing, or changes to records. The data does not establish a cause.
          </p>
        </>
      ) : (
        <>
          {!years.length && (
            <p className="mt-4 text-sm">
              No annual submission history is available for this period.
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {years.map((row, i) => {
              const difference = censusYearChange(years[i - 1], row);
              return (
                <li key={row.year} className="text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <strong>{row.year}</strong>
                    <span>
                      {row.count === null
                        ? "Missing data"
                        : `${number.format(row.count)} submissions`}
                    </span>
                  </div>
                  {row.count !== null && (
                    <div
                      aria-hidden="true"
                      className="mt-1 h-2 rounded bg-pine-50"
                    >
                      <div
                        className={`h-full rounded ${row.coverage === "complete" ? "bg-pine-700" : "bg-slate-400"}`}
                        style={{ width: `${(row.count / max) * 100}%` }}
                      />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-slate-600">
                    {row.coverage === "complete"
                      ? "Full year confirmed"
                      : row.coverage === "partial"
                        ? "Partial year"
                        : row.coverage === "missing"
                          ? "No recorded coverage"
                          : "Coverage unconfirmed"}
                    {difference &&
                      ` · ${signed(difference.count)} vs prior year${difference.percent === null ? "" : ` (${signed(Number(difference.percent.toFixed(1)))}%; base ${number.format(years[i - 1].count!)})`}`}
                  </p>
                </li>
              );
            })}
          </ul>
          {projection ? (
            <div className="mt-4 rounded-xl border-2 border-dashed border-pine-300 p-3 text-sm">
              <strong>
                {projection.year} projection: {number.format(projection.count)}{" "}
                submissions
              </strong>
              <p className="mt-1">
                Average annual change: {signed(projection.slope)} submissions.
                Repeating either of the two observed annual changes gives a
                planning range of {number.format(projection.scenarioLow)}–
                {number.format(projection.scenarioHigh)} submissions. This range
                compares scenarios; it is not a confidence interval.
              </p>
              <p className="mt-1">
                Adds the average annual change over the three consecutive
                confirmed years {projection.from}–{projection.to} for each of
                the {projection.yearsAhead} years after {projection.to}. The
                current partial year is excluded. The estimate is rounded and
                bounded at zero and describes submissions, not population.
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
              <strong>Insufficient data for a projection.</strong>{" "}
              {filtered
                ? "Clear the date and resident-status filters to check the full history."
                : "A forecast needs three consecutive confirmed full years ending last year."}
            </p>
          )}
        </>
      )}
    </article>
  );
}
