import { useId, useState } from "react";
import { analyticsNumber as number, analyticsColors } from "../lib/analytics";
export interface CountSeries {
  name: string;
  values: (number | null)[];
  dashed?: boolean;
}
/** Missing observations break the line. Zero is a real plotted observation. */
export default function CountLineChart({
  title,
  labels,
  series,
  unit = "residents",
}: {
  title: string;
  labels: string[];
  series: CountSeries[];
  unit?: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const id = useId();
  const visible = series.filter((s) => !hidden.includes(s.name));
  const max = Math.max(
    1,
    ...visible.flatMap((s) => s.values.filter((v): v is number => v !== null)),
  );
  const top = Math.ceil(max / 4) * 4;
  const x = (i: number) => 48 + (i / Math.max(1, labels.length - 1)) * 620;
  const y = (n: number) => 204 - (n / top) * 168;
  const active =
    selected !== null && selected < labels.length
      ? selected
      : Math.max(0, labels.length - 1);
  return (
    <div className="min-w-0">
      <div className="my-3 flex flex-wrap gap-3">
        {series.map((s, i) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={!hidden.includes(s.name)}
            onClick={() =>
              setHidden((h) =>
                h.includes(s.name)
                  ? h.filter((n) => n !== s.name)
                  : [...h, s.name],
              )
            }
            className="flex items-center gap-2 rounded px-1 py-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine-700"
          >
            <span
              aria-hidden="true"
              className="h-1 w-5"
              style={{
                background: analyticsColors[i % analyticsColors.length],
              }}
            />
            {s.name}
            {s.dashed ? " (dashed)" : ""}
          </button>
        ))}
      </div>
      {labels.length ? (
        <>
          <svg
            viewBox="0 0 700 244"
            role="img"
            aria-label={`${title}; ${unit}`}
            className="w-full overflow-visible"
          >
            {[0, 1, 2, 3, 4].map((t) => (
              <g key={t}>
                <line
                  x1="48"
                  x2="668"
                  y1={y((top * t) / 4)}
                  y2={y((top * t) / 4)}
                  stroke="#e2e8f0"
                />
                <text
                  x="39"
                  y={y((top * t) / 4) + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="#475569"
                >
                  {number.format((top * t) / 4)}
                </text>
              </g>
            ))}
            {visible.map((s) => {
              const color =
                analyticsColors[series.indexOf(s) % analyticsColors.length];
              let pen = false;
              const d = s.values
                .map((n, i) => {
                  if (n === null) {
                    pen = false;
                    return "";
                  }
                  const part = `${pen ? "L" : "M"}${x(i)},${y(n)}`;
                  pen = true;
                  return part;
                })
                .join(" ");
              return (
                <g key={s.name}>
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeDasharray={s.dashed ? "7 5" : undefined}
                  />
                  {s.values.map((n, i) =>
                    n === null ? null : (
                      <circle
                        key={i}
                        cx={x(i)}
                        cy={y(n)}
                        r={active === i ? 5 : 3.5}
                        fill={color}
                      >
                        <title>{`${labels[i]} · ${s.name}: ${number.format(n)} ${unit}`}</title>
                      </circle>
                    ),
                  )}
                </g>
              );
            })}
            {labels.map((label, i) => (
              <g
                key={label}
                onMouseEnter={() => setSelected(i)}
                onClick={() => setSelected(i)}
              >
                <rect
                  x={x(i) - Math.min(25, 310 / labels.length)}
                  y="25"
                  width={Math.min(50, 620 / labels.length)}
                  height="186"
                  fill="transparent"
                />
                {(i % Math.ceil(labels.length / 6) === 0 ||
                  i === labels.length - 1) && (
                  <text
                    x={x(i)}
                    y="228"
                    textAnchor="middle"
                    fontSize="12"
                    fill="#475569"
                  >
                    {label}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <label htmlFor={id} className="mt-2 block text-xs font-semibold">
            Inspect data point
          </label>
          <select
            id={id}
            className="input mt-1 max-w-xs"
            value={active}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {labels.map((l, i) => (
              <option key={l} value={i}>
                {l}
              </option>
            ))}
          </select>
          <div
            role="status"
            className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5"
          >
            <strong>{labels[active]}</strong>
            {visible.map((s) => (
              <p key={s.name}>
                {s.name}:{" "}
                {s.values[active] == null
                  ? "Unavailable / not yet observed"
                  : `${number.format(s.values[active]!)} ${unit}`}
              </p>
            ))}
            {!visible.length && <p>Select a series to display its values.</p>}
          </div>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-semibold">
              View exact data
            </summary>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-left">
                <caption className="sr-only">{title}</caption>
                <thead>
                  <tr>
                    <th className="p-2">Period</th>
                    {series.map((s) => (
                      <th className="p-2" key={s.name}>
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labels.map((label, i) => (
                    <tr key={label}>
                      <th className="p-2">{label}</th>
                      {series.map((s) => (
                        <td className="p-2" key={s.name}>
                          {s.values[i] ?? "Unavailable"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-sm">
          No historical records are available for this selection.
        </p>
      )}
    </div>
  );
}
