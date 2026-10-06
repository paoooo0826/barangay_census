import { useEffect, useState } from "react";
import {
  BarChart3,
  Compass,
  SearchCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface AdminAnalyticsProps {
  refreshKey?: number;
}
interface ChartRow {
  label: string;
  count: number;
  detail?: string;
}

interface AnalyticsData {
  total: number;
  excluded: number;
  age: ChartRow[];
  gender: ChartRow[];
  civil: ChartRow[];
  education: ChartRow[];
}
export default function AdminAnalytics({ refreshKey }: AdminAnalyticsProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    total: 0,
    excluded: 0,
    age: [],
    gender: [],
    civil: [],
    education: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const read = async () => {
      const { data, error: e } = await supabase.rpc("admin_census_analytics");
      if (!active) return;
      if (e) setError(e.message);
      else {
        setAnalytics(data as unknown as AnalyticsData);
        setError("");
      }
      setLoading(false);
    };
    void read();
    const timer = window.setInterval(() => void read(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey]);
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pine-100 text-pine-700">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-pine-700">
              Live Supabase census data
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              Barangay Census Analytics
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Charts count {analytics.total} approved census records. Pending,
              rejected, and legacy returned records are excluded (
              {analytics.excluded}).
            </p>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p className="p-8 text-center text-slate-500">
          Loading census analytics…
        </p>
      ) : !analytics.total ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="font-bold text-slate-700">No data available yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Charts will appear after census records are approved.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartCard
            title="Age Distribution"
            subtitle="Approved census records by age group"
            icon={SearchCheck}
            rows={analytics.age}
            note="This is the distribution of approved records, not a complete population estimate."
          />
          <ChartCard
            title="Gender Distribution"
            subtitle="Distribution by the census sex field"
            icon={Sparkles}
            rows={analytics.gender}
            note="Counts use the sex value provided in each saved census record."
          />
          <ChartCard
            title="Civil Status Distribution"
            subtitle="Distribution by recorded civil status"
            icon={TrendingUp}
            rows={analytics.civil}
            note="Counts represent approved census records, not a forecast."
          />
          <ChartCard
            title="Education Distribution"
            subtitle="Highest educational level reported by residents"
            icon={Compass}
            rows={analytics.education}
            note="Missing education values are shown as Not specified."
          />
        </div>
      )}
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  rows,
  note,
}: {
  title: string;
  subtitle: string;
  icon: typeof SearchCheck;
  rows: ChartRow[];
  note: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine-100 text-pine-700">
          <Icon size={20} />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={row.label}
              title={row.detail ?? `${row.label}: ${row.count}`}
            >
              <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 font-medium text-slate-700">
                  {row.label}
                </span>
                <span className="shrink-0 font-bold text-slate-900">
                  {row.count}{" "}
                  <span className="font-normal text-slate-400">
                    ({total ? Math.round((row.count / total) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-pine-700 transition-all"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
              {row.detail && (
                <p className="mt-1 text-xs text-slate-500">{row.detail}</p>
              )}
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            No data available yet.
          </p>
        )}
      </div>
      <p className="mt-5 rounded-xl border border-pine-100 bg-pine-50 p-3 text-xs leading-5 text-pine-900">
        {note}
      </p>
    </article>
  );
}
