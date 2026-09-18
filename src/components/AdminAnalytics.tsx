import { useMemo } from 'react';
import { BarChart3, GraduationCap, HeartHandshake, Users } from 'lucide-react';
import type { Resident } from '../types/database';

interface AdminAnalyticsProps { residents: Resident[]; }
interface ChartRow { label: string; count: number; }

function safeAge(birthDate: string) {
  const birth = new Date(birthDate); const now = new Date();
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}
function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  values.forEach((value) => { const key = value.trim() || 'Not specified'; counts[key] = (counts[key] ?? 0) + 1; });
  return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export default function AdminAnalytics({ residents }: AdminAnalyticsProps) {
  const charts = useMemo(() => {
    const ages: ChartRow[] = [
      { label: '0–17', count: 0 }, { label: '18–30', count: 0 }, { label: '31–45', count: 0 }, { label: '46–60', count: 0 }, { label: '61+', count: 0 },
    ];
    residents.forEach((resident) => { const age = safeAge(resident.birth_date); if (age == null) return; if (age < 18) ages[0].count += 1; else if (age <= 30) ages[1].count += 1; else if (age <= 45) ages[2].count += 1; else if (age <= 60) ages[3].count += 1; else ages[4].count += 1; });
    return {
      ages,
      sex: countBy(residents.map((r) => titleCase(r.sex || 'Not specified'))),
      civil: countBy(residents.map((r) => titleCase(r.civil_status || 'Not specified'))),
      education: countBy(residents.map((r) => r.highest_education?.trim() || 'Not specified')),
    };
  }, [residents]);

  return <section className="space-y-6">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><BarChart3 size={24}/></div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Live census data</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Analytics</h2><p className="mt-1 text-sm text-slate-500">Four primary demographic charts calculated from current Supabase resident records.</p></div></div>
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard title="Age Distribution" subtitle="Residents by age group" icon={Users} rows={charts.ages}/>
      <ChartCard title="Sex Distribution" subtitle="Residents by recorded sex" icon={HeartHandshake} rows={charts.sex}/>
      <ChartCard title="Civil Status Distribution" subtitle="Residents by civil status" icon={Users} rows={charts.civil}/>
      <ChartCard title="Education Distribution" subtitle="Residents by highest education" icon={GraduationCap} rows={charts.education}/>
    </div>
  </section>;
}

function ChartCard({ title, subtitle, icon: Icon, rows }: { title: string; subtitle: string; icon: typeof Users; rows: ChartRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count)); const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Icon size={20}/></div><div><h3 className="font-bold text-slate-900">{title}</h3><p className="text-xs text-slate-500">{subtitle}</p></div></div><div className="mt-6 space-y-4">{rows.length ? rows.map((row) => <div key={row.label}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium text-slate-700">{row.label}</span><span className="shrink-0 font-bold text-slate-900">{row.count} <span className="font-normal text-slate-400">({total ? Math.round(row.count / total * 100) : 0}%)</span></span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${row.count / max * 100}%` }}/></div></div>) : <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No census data available.</p>}</div></article>;
}
