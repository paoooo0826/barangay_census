import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BellRing,
  CalendarDays,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import AdminAnalytics from "../components/AdminAnalytics";
import AdminAnnouncements from "../components/AdminAnnouncements";
import AdminAppointments from "../components/AdminAppointments";
import SortControls from "../components/SortControls";
import PaginationControls, {
  pageSlice,
} from "../components/PaginationControls";
import { readAllRows } from "../lib/pagination";
import { compareValues, type SortDirection } from "../lib/sorting";
import type {
  AdminProfile,
  Appointment,
  Announcement,
  Resident,
  ResidentStatus,
} from "../types/database";

interface Props {
  tab?: string | null;
  onLogout: () => void;
  onReview: (id: string) => void;
}
type AdminTab =
  | "dashboard"
  | "records"
  | "analytics"
  | "announcements"
  | "appointments"
  | "account";
const PAGE_SIZE = 8;
const PRIMARY_TABS: Array<{
  value: Exclude<AdminTab, "account">;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "records", label: "Resident Records", icon: Users },
  { value: "analytics", label: "Analytics", icon: Activity },
  { value: "announcements", label: "Announcements", icon: BellRing },
  { value: "appointments", label: "Appointments", icon: CalendarDays },
];
const STATUS_STYLES: Record<ResidentStatus, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-800",
  returned: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
};
const STATUS_LABELS: Record<ResidentStatus, string> = {
  pending_review: "Pending Review",
  verified: "Approved",
  returned: "Legacy Returned",
  rejected: "Rejected",
};
function normalizeTab(value?: string | null): AdminTab {
  if (value === "overview") return "dashboard";
  if (value === "census") return "records";
  return [...PRIMARY_TABS.map((t) => t.value), "account"].includes(value ?? "")
    ? (value as AdminTab)
    : "dashboard";
}
function fullName(resident: Resident) {
  return [
    resident.first_name,
    resident.middle_name,
    resident.last_name,
    resident.suffix,
  ]
    .filter(Boolean)
    .join(" ");
}
function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
}
function localDateValue(date = new Date()) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}
function AdminNavLinks({
  activeTab,
  onSelect,
}: {
  activeTab: AdminTab;
  onSelect?: () => void;
}) {
  return (
    <>
      {PRIMARY_TABS.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.value}
            href={`#/admin/dashboard?tab=${item.value}`}
            onClick={onSelect}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${activeTab === item.value ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}
          >
            <Icon size={18} />
            {item.label}
          </a>
        );
      })}
    </>
  );
}

export default function AdminDashboard({ tab, onLogout, onReview }: Props) {
  const { user } = useAuth();
  const activeTab = normalizeTab(tab);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ResidentStatus>("all");
  const [sortField, setSortField] = useState("updated_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  const fetchData = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [residentRows, appointmentRows, announcementRows] =
          await Promise.all([
            readAllRows<Resident>((from, to) =>
              supabase
                .from("residents")
                .select("*")
                .order("updated_at", { ascending: false, nullsFirst: false })
                .order("id", { ascending: true })
                .range(from, to),
            ),
            readAllRows<Appointment>((from, to) =>
              supabase
                .from("appointments")
                .select("*")
                .order("created_at", { ascending: false })
                .order("id", { ascending: true })
                .range(from, to),
            ),
            readAllRows<Announcement>((from, to) =>
              supabase
                .from("announcements")
                .select("*")
                .order("created_at", { ascending: false })
                .order("id", { ascending: true })
                .range(from, to),
            ),
          ]);
        setResidents(residentRows);
        setAppointments(appointmentRows);
        setAnnouncements(announcementRows);
        if (user) {
          const { data, error: profileError } = await supabase
            .from("admin_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          if (profileError) throw profileError;
          setAdminProfile(data as AdminProfile | null);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load administrator data.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );
  useEffect(() => {
    void fetchData();
  }, [fetchData]);
  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);
  useEffect(() => {
    setPage(1);
  }, [search, status, sortField, sortDirection]);
  useEffect(() => {
    if (activeTab !== "records") return;
    const requested = new URLSearchParams(
      window.location.hash.split("?")[1] ?? "",
    ).get("status");
    if (
      ["pending_review", "verified", "rejected", "returned"].includes(
        requested ?? "",
      )
    )
      setStatus(requested as ResidentStatus);
  }, [activeTab, tab]);
  useEffect(() => {
    setCurrentTime(Date.now());
    const timer = window.setInterval(
      () => setCurrentTime(Date.now()),
      60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const refresh = async () => {
    await fetchData(true);
    setRefreshKey((value) => value + 1);
  };
  const filtered = useMemo(
    () =>
      residents
        .filter((resident) => {
          const query = search.trim().toLowerCase();
          const haystack =
            `${fullName(resident)} ${resident.tracking_number ?? ""} ${resident.residential_address ?? ""}`.toLowerCase();
          return (
            (!query || haystack.includes(query)) &&
            (status === "all" || resident.status === status)
          );
        })
        .sort((a, b) => {
          const value = (resident: Resident) =>
            sortField === "last_name"
              ? `${resident.last_name} ${resident.first_name}`
              : sortField === "updated_at"
                ? (resident.updated_at ?? resident.submitted_at)
                : resident[sortField as keyof Resident];
          return (
            compareValues(value(a), value(b), sortDirection) ||
            compareValues(a.id, b.id)
          );
        }),
    [residents, search, status, sortField, sortDirection],
  );
  const visibleRecords = pageSlice(filtered, page, PAGE_SIZE);
  const stats = useMemo(
    () => ({
      total: residents.length,
      verified: residents.filter((r) => r.status === "verified").length,
      rejected: residents.filter((r) => r.status === "rejected").length,
      pending: residents.filter((r) => r.status === "pending_review").length,
    }),
    [residents],
  );
  const today = localDateValue();
  const todayAppointments = appointments.filter(
    (item) =>
      item.appointment_date === today &&
      !["cancelled", "rejected"].includes(item.status),
  ).length;
  const pendingServices = appointments.filter(
    (item) => item.status === "pending",
  ).length;
  const activeAnnouncements = announcements.filter(
    (item) =>
      !item.archived &&
      item.is_published &&
      (!item.expires_at || new Date(item.expires_at).getTime() > currentTime),
  ).length;
  const recentResidents = useMemo(
    () =>
      [...residents]
        .sort(
          (a, b) =>
            new Date(b.updated_at ?? b.submitted_at).getTime() -
            new Date(a.updated_at ?? a.submitted_at).getTime(),
        )
        .slice(0, 5),
    [residents],
  );
  const profileName = adminProfile?.full_name?.trim() || "Administrator";

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur lg:pl-72">
        <div className="flex min-h-20 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-700 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                Barangay Old Lucban
              </p>
              <h1 className="font-bold">Administrator Portal</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-600"
              aria-label="Refresh"
            >
              <RefreshCw
                className={refreshing ? "animate-spin" : ""}
                size={18}
              />
            </button>
            <a
              href="#/admin/dashboard?tab=account"
              className={`hidden items-center gap-3 rounded-xl border px-3 py-2 sm:flex ${activeTab === "account" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 font-bold text-white">
                {profileName.charAt(0).toUpperCase()}
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">{profileName}</span>
                <span className="block text-xs text-slate-500">
                  Profile / Account
                </span>
              </span>
            </a>
          </div>
        </div>
      </header>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-800 to-blue-600 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
            Barangay Old Lucban
          </p>
          <p className="mt-1 text-xl font-bold">Admin Console</p>
        </div>
        <nav className="space-y-1">
          <AdminNavLinks activeTab={activeTab} />
        </nav>
        <div className="mt-auto border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/50"
          />
          <aside className="relative flex h-full w-[min(88vw,320px)] flex-col bg-white p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                  Barangay Old Lucban
                </p>
                <p className="font-bold">Admin Navigation</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl border border-slate-200 p-2"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="space-y-1">
              <AdminNavLinks
                activeTab={activeTab}
                onSelect={() => setMobileOpen(false)}
              />
              <a
                href="#/admin/dashboard?tab=account"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${activeTab === "account" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-blue-50"}`}
              >
                <UserCog size={18} />
                Profile / Account
              </a>
            </nav>
            <button
              type="button"
              onClick={onLogout}
              className="mt-auto flex w-full items-center gap-3 border-t border-slate-200 px-4 py-4 text-sm font-bold text-red-700"
            >
              <LogOut size={18} />
              Logout
            </button>
          </aside>
        </div>
      )}
      <main className="space-y-6 px-4 py-8 sm:px-6 lg:ml-72 lg:px-8">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {activeTab === "dashboard" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total Residents" value={stats.total} />
              <Stat label="Approved" value={stats.verified} />
              <Stat label="Pending Review" value={stats.pending} />
              <Stat label="Rejected" value={stats.rejected} />
            </div>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div>
                <h2 className="text-xl font-bold">Quick Actions</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Open the tasks that usually require immediate attention.
                </p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    label: "Review Pending Applications",
                    count: stats.pending,
                    href: "records&status=pending_review",
                    icon: FileSearch,
                  },
                  {
                    label: "View Resident Records",
                    count: stats.total,
                    href: "records",
                    icon: Users,
                  },
                  {
                    label: "View Today’s Appointments",
                    count: todayAppointments,
                    href: "appointments&date=today",
                    icon: CalendarDays,
                  },
                  {
                    label: "Create Announcement",
                    count: activeAnnouncements,
                    href: "announcements&new=1",
                    icon: BellRing,
                  },
                  {
                    label: "View Pending Service Requests",
                    count: pendingServices,
                    href: "appointments&status=pending",
                    icon: CalendarDays,
                  },
                  {
                    label: "Open Analytics",
                    count: null,
                    href: "analytics",
                    icon: Activity,
                  },
                ].map((action) => {
                  const Icon = action.icon;
                  return (
                    <a
                      key={action.label}
                      href={`#/admin/dashboard?tab=${action.href}`}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0 flex-1 font-bold text-slate-800">
                        {action.label}
                      </span>
                      {action.count !== null && (
                        <span className="rounded-full bg-blue-700 px-2.5 py-1 text-xs font-bold text-white">
                          {action.count}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">
                    Five Most Recent Resident Updates
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Latest submitted or updated census records.
                  </p>
                </div>
                <a
                  href="#/admin/dashboard?tab=records"
                  className="text-sm font-bold text-blue-700"
                >
                  View All
                </a>
              </div>
              <div className="mt-5 space-y-3">
                {recentResidents.map((resident) => (
                  <article
                    key={resident.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{fullName(resident)}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[resident.status]}`}
                        >
                          {STATUS_LABELS[resident.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {resident.tracking_number} · Updated{" "}
                        {formatDate(
                          resident.updated_at ?? resident.submitted_at,
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onReview(resident.id)}
                      className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white"
                    >
                      View
                    </button>
                  </article>
                ))}
                {!recentResidents.length && !loading && (
                  <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                    No resident records yet.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
        {activeTab === "records" && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <FileSearch className="text-blue-700" />
                <div>
                  <h2 className="text-xl font-bold">Resident Records</h2>
                  <p className="text-sm text-slate-500">
                    Search, sort, open, approve, or reject census records.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                <label className="relative">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, tracking number, address"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm"
                  />
                </label>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as "all" | ResidentStatus)
                  }
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="verified">Approved</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="rejected">Rejected</option>
                  <option value="returned">Legacy Returned</option>
                </select>
              </div>
              <div className="mt-4">
                <SortControls
                  id="resident-records"
                  field={sortField}
                  direction={sortDirection}
                  options={[
                    { value: "updated_at", label: "Last updated" },
                    { value: "last_name", label: "Last name" },
                    { value: "submitted_at", label: "Date submitted" },
                    { value: "status", label: "Status" },
                  ]}
                  onFieldChange={setSortField}
                  onDirectionChange={setSortDirection}
                />
              </div>
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  Loading records…
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {visibleRecords.map((resident) => (
                    <article
                      key={resident.id}
                      className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold">{fullName(resident)}</h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[resident.status]}`}
                          >
                            {STATUS_LABELS[resident.status]}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {resident.tracking_number} ·{" "}
                          {resident.residential_address ||
                            `${resident.barangay}, ${resident.city_municipality}`}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Updated{" "}
                          {formatDate(
                            resident.updated_at ?? resident.submitted_at,
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => onReview(resident.id)}
                        className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white"
                      >
                        Open Record
                      </button>
                    </article>
                  ))}
                  {!filtered.length && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
                      No matching resident records.
                    </div>
                  )}
                  <PaginationControls
                    page={page}
                    totalItems={filtered.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </div>
          </section>
        )}
        {activeTab === "analytics" && <AdminAnalytics residents={residents} />}{" "}
        {activeTab === "announcements" && (
          <AdminAnnouncements
            adminProfileId={adminProfile?.id}
            refreshKey={refreshKey}
          />
        )}{" "}
        {activeTab === "appointments" && (
          <AdminAppointments refreshKey={refreshKey} />
        )}{" "}
        {activeTab === "account" && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-blue-700">
              Administrator account
            </p>
            <h2 className="mt-1 text-2xl font-bold">Profile / Account</h2>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <Mini label="Full Name" value={profileName} />
              <Mini
                label="Role"
                value={adminProfile?.role ?? "Administrator"}
              />
              <Mini label="Email" value={user?.email ?? "Not available"} />
              <Mini
                label="Account Status"
                value={
                  adminProfile?.is_active === false ? "Inactive" : "Active"
                }
              />
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </article>
  );
}
function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-bold capitalize text-slate-800">{value}</dd>
    </div>
  );
}
