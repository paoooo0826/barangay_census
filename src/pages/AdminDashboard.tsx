import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Home,
  LogOut,
  PieChart,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { Resident } from '../types/database';
import AdminAnalytics from '../components/AdminAnalytics';
import AdminAnnouncements from '../components/AdminAnnouncements';

interface AdminDashboardProps {
  onLogout: () => void;
  onReview: (residentId: string) => void;
}

interface DashboardStats {
  totalResidents: number;
  pendingReviews: number;
  verifiedRecords: number;
  returnedRecords: number;
  rejectedRecords: number;
  households: number;
}

interface AgeDistribution {
  range: string;
  count: number;
}

interface SexDistribution {
  sex: string;
  count: number;
}

interface CivilStatusDistribution {
  status: string;
  count: number;
}

type ResidentStatus =
  | 'pending_review'
  | 'verified'
  | 'returned'
  | 'rejected';

const STATUS_CONFIG: Record<
  ResidentStatus,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  pending_review: {
    label: 'Pending Review',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    dotClass: 'bg-amber-500',
  },
  verified: {
    label: 'Verified',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  returned: {
    label: 'Returned',
    badgeClass: 'bg-orange-50 text-orange-700 ring-orange-200',
    dotClass: 'bg-orange-500',
  },
  rejected: {
    label: 'Rejected',
    badgeClass: 'bg-red-50 text-red-700 ring-red-200',
    dotClass: 'bg-red-500',
  },
};

const formatLabel = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminDashboard({
  onLogout,
  onReview,
}: AdminDashboardProps) {
  const { adminProfile } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    totalResidents: 0,
    pendingReviews: 0,
    verifiedRecords: 0,
    returnedRecords: 0,
    rejectedRecords: 0,
    households: 0,
  });

  const [residents, setResidents] = useState<Resident[]>([]);
  const [ageDistribution, setAgeDistribution] = useState<AgeDistribution[]>([]);
  const [sexDistribution, setSexDistribution] = useState<SexDistribution[]>([]);
  const [civilDistribution, setCivilDistribution] = useState<
    CivilStatusDistribution[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchData();
  }, []);

  const calculateAge = (birthDate: string): number => {
    const today = new Date();
    const birth = new Date(birthDate);

    let age = today.getFullYear() - birth.getFullYear();

    const monthDifference = today.getMonth() - birth.getMonth();

    if (
      monthDifference < 0 ||
      (monthDifference === 0 && today.getDate() < birth.getDate())
    ) {
      age -= 1;
    }

    return age;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: residentsError } = await supabase
        .from('residents')
        .select('*')
        .order('submitted_at', {
          ascending: false,
        });

      if (residentsError) {
        throw residentsError;
      }

      const residentsData = (data ?? []) as Resident[];

      setResidents(residentsData);

      const uniqueAddresses = new Set(
        residentsData
          .map((resident) => resident.residential_address?.trim())
          .filter(Boolean),
      );

      setStats({
        totalResidents: residentsData.length,
        pendingReviews: residentsData.filter(
          (resident) => resident.status === 'pending_review',
        ).length,
        verifiedRecords: residentsData.filter(
          (resident) => resident.status === 'verified',
        ).length,
        returnedRecords: residentsData.filter(
          (resident) => resident.status === 'returned',
        ).length,
        rejectedRecords: residentsData.filter(
          (resident) => resident.status === 'rejected',
        ).length,
        households: uniqueAddresses.size,
      });

      const ageGroups: AgeDistribution[] = [
        { range: '0–17', count: 0 },
        { range: '18–30', count: 0 },
        { range: '31–45', count: 0 },
        { range: '46–60', count: 0 },
        { range: '61+', count: 0 },
      ];

      residentsData.forEach((resident) => {
        const age = calculateAge(resident.birth_date);

        if (age < 18) {
          ageGroups[0].count += 1;
        } else if (age <= 30) {
          ageGroups[1].count += 1;
        } else if (age <= 45) {
          ageGroups[2].count += 1;
        } else if (age <= 60) {
          ageGroups[3].count += 1;
        } else {
          ageGroups[4].count += 1;
        }
      });

      setAgeDistribution(ageGroups);

      const sexCounts: Record<string, number> = {};

      residentsData.forEach((resident) => {
        const sex = resident.sex || 'Not specified';
        sexCounts[sex] = (sexCounts[sex] || 0) + 1;
      });

      setSexDistribution(
        Object.entries(sexCounts).map(([sex, count]) => ({
          sex,
          count,
        })),
      );

      const civilCounts: Record<string, number> = {};

      residentsData.forEach((resident) => {
        const status = resident.civil_status || 'Not specified';
        civilCounts[status] = (civilCounts[status] || 0) + 1;
      });

      setCivilDistribution(
        Object.entries(civilCounts).map(([status, count]) => ({
          status,
          count,
        })),
      );
    } catch (fetchError) {
      console.error('Error loading dashboard:', fetchError);

      setError(
        'Unable to load the administrator dashboard. Please try refreshing the page.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const filteredResidents = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return residents.filter((resident) => {
      const fullName = [
        resident.first_name,
        resident.middle_name,
        resident.last_name,
        resident.suffix,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const trackingNumber = resident.tracking_number?.toLowerCase() ?? '';
      const address = resident.residential_address?.toLowerCase() ?? '';

      const matchesSearch =
        normalizedSearch.length === 0 ||
        trackingNumber.includes(normalizedSearch) ||
        fullName.includes(normalizedSearch) ||
        address.includes(normalizedSearch);

      const matchesStatus =
        statusFilter === 'all' || resident.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [residents, searchQuery, statusFilter]);

  const maxAgeCount = Math.max(
    ...ageDistribution.map((item) => item.count),
    1,
  );

  const maxSexCount = Math.max(
    ...sexDistribution.map((item) => item.count),
    1,
  );

  const maxCivilCount = Math.max(
    ...civilDistribution.map((item) => item.count),
    1,
  );

  const statCards = [
    {
      title: 'Total Residents',
      value: stats.totalResidents,
      description: 'All submitted census records',
      icon: Users,
      iconClass: 'bg-blue-100 text-blue-700',
      borderClass: 'border-blue-100',
    },
    {
      title: 'Pending Review',
      value: stats.pendingReviews,
      description: 'Waiting for administrator action',
      icon: Clock,
      iconClass: 'bg-amber-100 text-amber-700',
      borderClass: 'border-amber-100',
    },
    {
      title: 'Verified',
      value: stats.verifiedRecords,
      description: 'Approved census records',
      icon: CheckCircle2,
      iconClass: 'bg-emerald-100 text-emerald-700',
      borderClass: 'border-emerald-100',
    },
    {
      title: 'Returned',
      value: stats.returnedRecords,
      description: 'Sent back for correction',
      icon: AlertCircle,
      iconClass: 'bg-orange-100 text-orange-700',
      borderClass: 'border-orange-100',
    },
    {
      title: 'Rejected',
      value: stats.rejectedRecords,
      description: 'Declined submissions',
      icon: XCircle,
      iconClass: 'bg-red-100 text-red-700',
      borderClass: 'border-red-100',
    },
    {
      title: 'Households',
      value: stats.households,
      description: 'Unique residential addresses',
      icon: Home,
      iconClass: 'bg-violet-100 text-violet-700',
      borderClass: 'border-violet-100',
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4">
        <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-700" />
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Loading dashboard
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Retrieving resident records and census statistics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/60 to-indigo-50">
      <header className="border-b border-blue-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-700 text-white shadow-lg shadow-blue-200">
              <Home className="h-6 w-6" />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                Barangay Census System
              </p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Administrator Dashboard
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Welcome back,{' '}
                <span className="font-semibold text-slate-700">
                  {adminProfile?.full_name || 'Administrator'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />

              <span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <div className="flex-1">
              <p className="font-semibold">Dashboard error</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        <section className="mb-8">
          <div className="mb-5">
            <p className="text-sm font-semibold text-blue-700">
              Census overview
            </p>

            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              Record summary
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              A quick view of submissions, review progress, and registered
              households.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {statCards.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className={`rounded-2xl border ${item.borderClass} bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">
                        {item.title}
                      </p>

                      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                        {item.value.toLocaleString()}
                      </p>

                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        {item.description}
                      </p>
                    </div>

                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.iconClass}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mb-8 grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Demographics
                </p>

                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Age Distribution
                </h3>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <BarChart3 className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-5">
              {ageDistribution.map((group) => {
                const width = (group.count / maxAgeCount) * 100;

                return (
                  <div key={group.range}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-600">
                        {group.range} years
                      </span>

                      <span className="font-bold text-slate-900">
                        {group.count}
                      </span>
                    </div>

                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-violet-700">
                  Demographics
                </p>

                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Sex Distribution
                </h3>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <PieChart className="h-5 w-5" />
              </div>
            </div>

            {sexDistribution.length > 0 ? (
              <div className="space-y-5">
                {sexDistribution.map((item) => {
                  const width = (item.count / maxSexCount) * 100;

                  return (
                    <div key={item.sex}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-600">
                          {formatLabel(item.sex)}
                        </span>

                        <span className="font-bold text-slate-900">
                          {item.count}
                        </span>
                      </div>

                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-600 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No sex distribution data available.
              </p>
            )}
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Demographics
                </p>

                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Civil Status
                </h3>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Activity className="h-5 w-5" />
              </div>
            </div>

            {civilDistribution.length > 0 ? (
              <div className="space-y-5">
                {civilDistribution.map((item) => {
                  const width = (item.count / maxCivilCount) * 100;

                  return (
                    <div key={item.status}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-600">
                          {formatLabel(item.status)}
                        </span>

                        <span className="font-bold text-slate-900">
                          {item.count}
                        </span>
                      </div>

                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No civil status data available.
              </p>
            )}
          </article>
        </section>

        <AdminAnalytics residents={residents} />

        <AdminAnnouncements adminProfileId={adminProfile?.id} />

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  Resident management
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Resident Records
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Review census submissions and update their verification
                  status.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
                <div className="relative min-w-0 sm:min-w-[280px]">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="Search name, tracking number, address"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                >
                  <option value="all">All statuses</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="verified">Verified</option>
                  <option value="returned">Returned</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-6">
            <p className="text-sm text-slate-500">
              Showing{' '}
              <span className="font-semibold text-slate-800">
                {filteredResidents.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-800">
                {residents.length}
              </span>{' '}
              records
            </p>
          </div>

          {filteredResidents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Search className="h-7 w-7" />
              </div>

              <h3 className="mt-5 text-lg font-bold text-slate-900">
                No resident records found
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Try changing your search term or selecting a different status
                filter.
              </p>

              {(searchQuery || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="mt-5 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Tracking Number
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Resident
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Submitted
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Status
                      </th>

                      <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredResidents.map((resident) => {
                      const residentStatus =
                        STATUS_CONFIG[
                          resident.status as ResidentStatus
                        ] ?? STATUS_CONFIG.pending_review;

                      const residentName = [
                        resident.first_name,
                        resident.middle_name,
                        resident.last_name,
                        resident.suffix,
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <tr
                          key={resident.id}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="px-6 py-5">
                            <span className="font-mono text-sm font-semibold text-slate-700">
                              {resident.tracking_number}
                            </span>
                          </td>

                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-sm font-bold text-blue-700">
                                {resident.first_name?.charAt(0).toUpperCase()}
                                {resident.last_name?.charAt(0).toUpperCase()}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {residentName}
                                </p>

                                <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                                  {resident.residential_address}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-5 text-sm text-slate-600">
                            {formatDate(resident.submitted_at)}
                          </td>

                          <td className="px-6 py-5">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${residentStatus.badgeClass}`}
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${residentStatus.dotClass}`}
                              />

                              {residentStatus.label}
                            </span>
                          </td>

                          <td className="px-6 py-5 text-right">
                            <button
                              type="button"
                              onClick={() => onReview(resident.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                            >
                              <Eye className="h-4 w-4" />
                              Review
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {filteredResidents.map((resident) => {
                  const residentStatus =
                    STATUS_CONFIG[
                      resident.status as ResidentStatus
                    ] ?? STATUS_CONFIG.pending_review;

                  const residentName = [
                    resident.first_name,
                    resident.middle_name,
                    resident.last_name,
                    resident.suffix,
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <article key={resident.id} className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-sm font-bold text-blue-700">
                          {resident.first_name?.charAt(0).toUpperCase()}
                          {resident.last_name?.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">
                            {residentName}
                          </p>

                          <p className="mt-1 break-all font-mono text-xs text-slate-500">
                            {resident.tracking_number}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-slate-500">
                            Status
                          </span>

                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${residentStatus.badgeClass}`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${residentStatus.dotClass}`}
                            />

                            {residentStatus.label}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-slate-500">
                            Submitted
                          </span>

                          <span className="text-sm font-semibold text-slate-700">
                            {formatDate(resident.submitted_at)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onReview(resident.id)}
                        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
                      >
                        <Eye className="h-4 w-4" />
                        Review Resident
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
