import { useMemo, useState } from "react";
import type { CensusYear } from "../lib/censusYears";
import { forecastAnnual } from "../lib/forecast";
import CountLineChart from "./CountLineChart";
export default function ForecastPanel({
  years,
  reportDate,
  generatedAt,
}: {
  years: CensusYear[];
  reportDate: string;
  generatedAt: string;
}) {
  const [horizon, setHorizon] = useState(1);
  const forecast = useMemo(
    () => forecastAnnual(years, Number(reportDate.slice(0, 4)), horizon),
    [years, reportDate, horizon],
  );
  const points = [
    ...years.map((y) => ({
      year: y.year,
      actual: y.count,
      forecast: null as number | null,
    })),
    ...(forecast?.points ?? []).map((y) => ({
      year: y.year,
      actual: null,
      forecast: y.count,
    })),
  ];
  return (
    <article className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="font-bold">
        Verified census submissions: history and forecast
      </h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        One currently verified account per latest submission year · submissions,
        not population. Current verification status and later edits can revise
        this proxy. Missing years are not zero; the current year is partial.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="label text-xs">
          Forecast horizon
          <select
            className="input mt-1"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          >
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "year" : "years"}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-xl bg-pine-50 p-3 text-xs">
          <strong>
            {forecast
              ? "Forecast calculated"
              : "Insufficient historical data for reliable forecasting"}
          </strong>
          <p className="mt-1">
            Last evaluated:{" "}
            {new Date(generatedAt).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            · Asia/Manila
          </p>
        </div>
      </div>
      <CountLineChart
        title="Verified census submissions by year"
        unit="submissions"
        labels={points.map(
          (r) =>
            String(r.year) +
            (years.find((y) => y.year === r.year)?.coverage === "partial"
              ? "*"
              : ""),
        )}
        series={[
          { name: "Recorded submissions", values: points.map((r) => r.actual) },
          {
            name: "Projected submissions",
            dashed: true,
            values: points.map(
              (r, i) =>
                r.forecast ??
                (forecast && i === years.length - 1 ? r.actual : null),
            ),
          },
        ]}
      />
      {!forecast && (
        <p className="mt-3 text-sm text-slate-600">
          No estimate is generated. At least four consecutive, comparable,
          confirmed full years ending last year are required for training and a
          held-out test. Submission dates alone do not confirm annual census
          coverage. No population snapshot dataset exists in this system.
        </p>
      )}
      {forecast && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["Next year", forecast.points[0].count],
            ["Backtest MAE", forecast.mae.toFixed(1)],
            [
              "Backtest MAPE",
              forecast.mape === null
                ? "Unavailable"
                : forecast.mape.toFixed(1) + "%",
            ],
          ].map(([label, value]) => (
            <div className="rounded-xl bg-pine-50 p-3" key={label}>
              <p className="text-xs">{label}</p>
              <strong className="text-xl">{value}</strong>
            </div>
          ))}
        </div>
      )}
      <details className="mt-4 rounded-xl border p-4 text-xs leading-6">
        <summary className="cursor-pointer font-bold">Forecast Details</summary>
        <p>
          Method: ordinary least-squares linear trend using up to ten
          consecutive confirmed full years; estimates rounded to whole
          submissions and bounded at zero. Horizons are measured from the last
          full year. No hardcoded forecast counts are used.
        </p>
        <p>
          Validation: expanding-window backtesting. Train on at least three
          older years and predict each subsequent known year. MAE is the mean
          absolute error in submissions; MAPE is the mean absolute percentage
          error for nonzero actual years. Small errors in a short backtest do
          not guarantee future accuracy.
        </p>
        <p>
          Training period:{" "}
          {forecast
            ? `${forecast.from}–${forecast.to}`
            : "Unavailable: annual coverage is not confirmed"}
          .{" "}
          {forecast
            ? `${forecast.validation.length} held-out years; ${forecast.mapeYears} nonzero years in MAPE.`
            : "No validation score is manufactured when training data is insufficient."}
        </p>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th>Year</th>
              <th>Actual</th>
              <th>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {years.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td>{r.count ?? "Missing"}</td>
                <td>{r.coverage}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {forecast && (
          <table className="mt-3 w-full text-left">
            <thead>
              <tr>
                <th>Held-out year</th>
                <th>Actual</th>
                <th>Predicted</th>
                <th>Absolute error</th>
              </tr>
            </thead>
            <tbody>
              {forecast.validation.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td>{r.actual}</td>
                  <td>{r.predicted}</td>
                  <td>{Math.abs(r.actual - r.predicted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2">
          Limitations: this series measures submissions from the currently
          verified records, not annual population. Missing years and unconfirmed
          coverage prevent a defensible forecast. Staff must establish
          comparable coverage before using this method for planning; these
          estimates do not establish a cause or a guaranteed outcome.
        </p>
      </details>
    </article>
  );
}
