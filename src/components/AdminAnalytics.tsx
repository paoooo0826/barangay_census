import { useMemo } from "react";
import {
  BarChart3,
  Compass,
  SearchCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { educationStatusLabel } from "../lib/displayLabels";
import type { Resident } from "../types/database";

interface AdminAnalyticsProps {
  residents: Resident[];
}
interface ChartRow {
  label: string;
  count: number;
  detail?: string;
}

function safeAge(birthDate: string, offsetYears = 0) {
  const birth = new Date(birthDate);
  const now = new Date();
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
  age += offsetYears;
  return age >= 0 && age <= 130 ? age : null;
}
function ageRows(residents: Resident[], offsetYears = 0): ChartRow[] {
  const rows: ChartRow[] = [
    { label: "Children (0–17)", count: 0 },
    { label: "Young adults (18–30)", count: 0 },
    { label: "Adults (31–59)", count: 0 },
    { label: "Senior citizens (60+)", count: 0 },
  ];
  residents.forEach((resident) => {
    const age = safeAge(resident.birth_date, offsetYears);
    if (age == null) return;
    if (age < 18) rows[0].count += 1;
    else if (age <= 30) rows[1].count += 1;
    else if (age < 60) rows[2].count += 1;
    else rows[3].count += 1;
  });
  return rows;
}
function hasOccupation(value?: string | null) {
  return Boolean(
    value?.trim() &&
    !/^(none|n\/a|unemployed|not applicable)$/i.test(value.trim()),
  );
}

export default function AdminAnalytics({ residents }: AdminAnalyticsProps) {
  const analytics = useMemo(() => {
    const diagnosticMap = new Map<string, number>();
    residents.forEach((resident) => {
      const status =
        educationStatusLabel(resident.education_status) ||
        "Education not specified";
      const key = `${status} — ${hasOccupation(resident.profession_occupation) ? "occupation recorded" : "no occupation recorded"}`;
      diagnosticMap.set(key, (diagnosticMap.get(key) ?? 0) + 1);
    });
    const diagnostic = [...diagnosticMap]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const serviceFocus: ChartRow[] = [
      {
        label: "Senior support indicator",
        count: residents.filter((r) => (safeAge(r.birth_date) ?? -1) >= 60)
          .length,
        detail: "Residents currently aged 60 or older.",
      },
      {
        label: "Youth/minor support indicator",
        count: residents.filter((r) => {
          const age = safeAge(r.birth_date);
          return age != null && age < 18;
        }).length,
        detail: "Residents currently below 18.",
      },
      {
        label: "Housing support indicator",
        count: residents.filter((r) =>
          /renter|rented/i.test(r.tenurial_status ?? ""),
        ).length,
        detail: "Residents whose recorded tenure indicates renting.",
      },
      {
        label: "Livelihood follow-up indicator",
        count: residents.filter((r) => !hasOccupation(r.profession_occupation))
          .length,
        detail: "Residents with no recorded occupation; verify before acting.",
      },
    ];
    return {
      descriptive: ageRows(residents),
      diagnostic,
      predictive: ageRows(residents, 1),
      prescriptive: serviceFocus,
    };
  }, [residents]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              Live Supabase census data
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              Barangay Census Analytics
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              All four views are derived from saved resident records. No dummy
              production values are used.
            </p>
          </div>
        </div>
      </div>
      {!residents.length ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="font-bold text-slate-700">No data available yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Charts will appear after resident census records are submitted.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartCard
            title="Descriptive Analytics"
            subtitle="Current population distribution by age group"
            icon={SearchCheck}
            rows={analytics.descriptive}
            note="Shows what is currently recorded in the census."
          />
          <ChartCard
            title="Diagnostic Analytics"
            subtitle="Education status compared with whether an occupation is recorded"
            icon={Sparkles}
            rows={analytics.diagnostic}
            note="This shows associations in recorded data only; it does not establish causation."
          />
          <ChartCard
            title="Predictive Analytics"
            subtitle="Estimated age-group distribution one year from now"
            icon={TrendingUp}
            rows={analytics.predictive}
            note="Projection only: each valid recorded age is advanced by one year. Births, deaths, and migration are not modeled."
          />
          <ChartCard
            title="Prescriptive Analytics"
            subtitle="Data-supported groups that may merit administrative review"
            icon={Compass}
            rows={analytics.prescriptive}
            note="Planning indicators, not authoritative eligibility decisions. Verify individual records before taking action."
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
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
                  className="h-full rounded-full bg-blue-700 transition-all"
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
      <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
        {note}
      </p>
    </article>
  );
}
