import { useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Info,
  Lightbulb,
  Target,
  TrendingUp,
} from 'lucide-react';

import type { Resident } from '../types/database';

interface AdminAnalyticsProps {
  residents: Resident[];
}

interface AgeGroup {
  label: string;
  count: number;
}

function safeAge(birthDate: string, atDate = new Date()) {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime()) || birth > atDate) return null;

  let age = atDate.getFullYear() - birth.getFullYear();
  const monthDifference = atDate.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && atDate.getDate() < birth.getDate())) age -= 1;
  return age;
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminAnalytics({ residents }: AdminAnalyticsProps) {
  const analytics = useMemo(() => {
    const now = new Date();
    const total = residents.length;
    const ages = residents
      .map((resident) => safeAge(resident.birth_date, now))
      .filter((age): age is number => age !== null);

    const ageGroups: AgeGroup[] = [
      { label: 'Children (0–17)', count: ages.filter((age) => age < 18).length },
      { label: 'Young adults (18–30)', count: ages.filter((age) => age >= 18 && age <= 30).length },
      { label: 'Adults (31–59)', count: ages.filter((age) => age >= 31 && age <= 59).length },
      { label: 'Senior citizens (60+)', count: ages.filter((age) => age >= 60).length },
    ];

    const verified = residents.filter((resident) => resident.status === 'verified').length;
    const pending = residents.filter((resident) => resident.status === 'pending_review').length;
    const returned = residents.filter((resident) => resident.status === 'returned').length;
    const rejected = residents.filter((resident) => resident.status === 'rejected').length;
    const renters = residents.filter((resident) =>
      ['renter', 'rented'].includes(resident.tenurial_status?.trim().toLowerCase() ?? ''),
    );
    const rents = renters
      .map((resident) => Number(resident.monthly_rent))
      .filter((rent) => Number.isFinite(rent) && rent > 0);
    const averageRent = rents.length > 0
      ? rents.reduce((sum, rent) => sum + rent, 0) / rents.length
      : 0;

    const averageAge = ages.length > 0
      ? ages.reduce((sum, age) => sum + age, 0) / ages.length
      : 0;
    const largestAgeGroup = ageGroups.reduce(
      (largest, group) => (group.count > largest.count ? group : largest),
      ageGroups[0],
    );
    const missingContact = residents.filter((resident) => !resident.contact_number?.trim()).length;
    const missingEducation = residents.filter((resident) => !resident.highest_education?.trim()).length;

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now.getTime() - 30 * millisecondsPerDay;
    const sixtyDaysAgo = now.getTime() - 60 * millisecondsPerDay;
    const recentSubmissions = residents.filter((resident) => {
      const submitted = new Date(resident.submitted_at).getTime();
      return Number.isFinite(submitted) && submitted >= thirtyDaysAgo;
    }).length;
    const previousSubmissions = residents.filter((resident) => {
      const submitted = new Date(resident.submitted_at).getTime();
      return Number.isFinite(submitted) && submitted >= sixtyDaysAgo && submitted < thirtyDaysAgo;
    }).length;

    const rawGrowth = previousSubmissions > 0
      ? (recentSubmissions - previousSubmissions) / previousSubmissions
      : 0;
    const cappedGrowth = Math.max(-0.5, Math.min(1, rawGrowth));
    const projectedSubmissions = Math.max(0, Math.round(recentSubmissions * (1 + cappedGrowth)));
    const projectedPending = Math.round(projectedSubmissions * (total > 0 ? pending / total : 0));
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    const turningSenior = residents.filter((resident) => {
      const ageNow = safeAge(resident.birth_date, now);
      const ageNextYear = safeAge(resident.birth_date, oneYearFromNow);
      return ageNow !== null && ageNextYear !== null && ageNow < 60 && ageNextYear >= 60;
    }).length;

    const recommendations: string[] = [];
    if (percentage(pending, total) >= 20) {
      recommendations.push(`Schedule a focused review session for the ${pending} pending record${pending === 1 ? '' : 's'} to reduce the verification backlog.`);
    }
    if (percentage(returned + rejected, total) >= 10) {
      recommendations.push('Review the most common correction reasons and add clearer guidance beside the related census fields.');
    }
    if (percentage(missingContact, total) >= 10) {
      recommendations.push(`Follow up on ${missingContact} record${missingContact === 1 ? '' : 's'} without contact numbers so urgent notices can reach more households.`);
    }
    if (renters.length > 0) {
      recommendations.push(`Use the ${renters.length} renter record${renters.length === 1 ? '' : 's'} and the ${formatCurrency(averageRent)} average reported rent as a starting point for housing-support assessment.`);
    }
    if (turningSenior > 0) {
      recommendations.push(`Prepare senior-citizen registration outreach for ${turningSenior} resident${turningSenior === 1 ? '' : 's'} expected to turn 60 within 12 months.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Continue monthly monitoring; no rule-based high-priority intervention is currently indicated by the available records.');
    }

    return {
      total,
      averageAge,
      verified,
      pending,
      returned,
      rejected,
      renters: renters.length,
      averageRent,
      largestAgeGroup,
      missingContact,
      missingEducation,
      recentSubmissions,
      previousSubmissions,
      projectedSubmissions,
      projectedPending,
      turningSenior,
      recommendations,
    };
  }, [residents]);

  const descriptiveCards = [
    { label: 'Average resident age', value: analytics.total ? `${analytics.averageAge.toFixed(1)} years` : 'No data' },
    { label: 'Verification rate', value: `${percentage(analytics.verified, analytics.total)}%` },
    { label: 'Renting households', value: `${analytics.renters} (${percentage(analytics.renters, analytics.total)}%)` },
    { label: 'Average reported rent', value: analytics.averageRent ? formatCurrency(analytics.averageRent) : 'No rent data' },
  ];

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Decision support</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Census Data Analysis</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Descriptive, diagnostic, predictive, and prescriptive views calculated from the current resident records.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Descriptive analysis</p>
              <h3 className="font-bold text-slate-900">What is happening now?</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {descriptiveCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{card.value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-amber-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Diagnostic analysis</p>
              <h3 className="font-bold text-slate-900">Where are the pressure points?</h3>
            </div>
          </div>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
            <li className="rounded-xl bg-white p-4"><strong>{analytics.pending}</strong> pending records represent <strong>{percentage(analytics.pending, analytics.total)}%</strong> of all submissions.</li>
            <li className="rounded-xl bg-white p-4"><strong>{analytics.returned + analytics.rejected}</strong> records were returned or rejected, a <strong>{percentage(analytics.returned + analytics.rejected, analytics.total)}%</strong> exception rate.</li>
            <li className="rounded-xl bg-white p-4"><strong>{analytics.largestAgeGroup.label}</strong> is the largest age group with <strong>{analytics.largestAgeGroup.count}</strong> residents.</li>
            <li className="rounded-xl bg-white p-4"><strong>{analytics.missingContact}</strong> missing contact number{analytics.missingContact === 1 ? '' : 's'} and <strong>{analytics.missingEducation}</strong> missing education entr{analytics.missingEducation === 1 ? 'y' : 'ies'} reduce data completeness.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-violet-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Predictive analysis</p>
              <h3 className="font-bold text-slate-900">What may happen next?</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-slate-500">Next 30-day submissions</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{analytics.projectedSubmissions}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-slate-500">Possible new pending records</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{analytics.projectedPending}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-slate-500">Turning 60 within 12 months</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{analytics.turningSenior}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Projection compares {analytics.recentSubmissions} submissions in the latest 30 days with {analytics.previousSubmissions} in the preceding 30 days. Growth is capped to limit extreme estimates from small samples.
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Prescriptive analysis</p>
              <h3 className="font-bold text-slate-900">What should the barangay consider?</h3>
            </div>
          </div>
          <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
            {analytics.recommendations.map((recommendation, index) => (
              <li key={recommendation} className="flex gap-3 rounded-xl bg-white p-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{index + 1}</span>
                <span>{recommendation}</span>
              </li>
            ))}
          </ol>
        </article>
      </div>

      <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 text-xs leading-5 text-slate-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>These are transparent rule-based estimates from available census records. They support planning but do not guarantee future outcomes or replace administrator judgment.</p>
      </div>
    </section>
  );
}
