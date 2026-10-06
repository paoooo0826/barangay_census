import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BellRing,
  CalendarDays,
  FileSearch,
  LayoutDashboard,
  Home,
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
import HousingManager from "../components/HousingManager";
import BarangayBrand from "../components/BarangayBrand";
import { useDialogFocus } from "../hooks/useDialogFocus";
import RecentServices from "../components/RecentServices";
import AdminAppointments from "../components/AdminAppointments";
import SortControls from "../components/SortControls";
import PaginationControls from "../components/PaginationControls";
import { usePagedQuery, searchPattern } from "../hooks/usePagedQuery";
import { EMPTY_ADMIN_SUMMARY, type AdminSummary } from "../lib/adminData";
import { type SortDirection } from "../lib/sorting";
import type {
  BoardingStatus,
  Resident,
  ResidentStatus,
} from "../types/database";
import { BOARDING_OPTIONS, boardingStatusLabel } from "../lib/boarding";

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
  | "history"
  | "services"
  | "housing"
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
  { value: "history", label: "Appointment History", icon: CalendarDays },
  { value: "services", label: "Services", icon: FileSearch },
  { value: "housing", label: "Boarding Houses", icon: Home },
];
const STATUS_STYLES: Record<ResidentStatus, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  verified: "bg-sage-100 text-sage-800",
  returned: "bg-pine-100 text-pine-800",
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
            aria-current={activeTab === item.value ? "page" : undefined}
            className={`nav-item ${activeTab === item.value ? "nav-item-active" : ""}`}
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
  const { user, adminProfile } = useAuth();
  const activeTab = normalizeTab(tab);
  const [summary, setSummary] = useState<AdminSummary>(EMPTY_ADMIN_SUMMARY);
  const summaryRequest = useRef(0);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ResidentStatus>("all");
  const [boardingFilter, setBoardingFilter] = useState<"all" | BoardingStatus>(
    "all",
  );
  const [sortField, setSortField] = useState("updated_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async (manual = false) => {
    const request = ++summaryRequest.current;
    if (manual) setRefreshing(true);
    try {
      const { data, error: e } = await supabase.rpc("admin_dashboard_summary", {
        p_mode: "all",
      });
      if (request !== summaryRequest.current) return;
      if (e) throw e;
      setSummary(data as unknown as AdminSummary);
      setError(null);
    } catch (caught) {
      if (request === summaryRequest.current)
        setError(
          caught && typeof caught === "object" && "message" in caught
            ? String(caught.message)
            : "Unable to load administrator data.",
        );
    } finally {
      if (request === summaryRequest.current) {
        setLoadingSummary(false);
        setRefreshing(false);
      }
    }
  }, []);
  useEffect(() => {
    void fetchData();
    const timer = window.setInterval(() => void fetchData(), 60_000);
    return () => {
      ++summaryRequest.current;
      window.clearInterval(timer);
    };
  }, [fetchData, user?.id]);
  const recordQuery = useCallback(
    (from: number, to: number) => {
      let q = supabase
        .from("admin_resident_records")
        .select("*", { count: "exact" });
      if (status !== "all") q = q.eq("status", status);
      if (boardingFilter !== "all") q = q.eq("boarding_status", boardingFilter);
      if (search.trim()) q = q.ilike("search_text", searchPattern(search));
      q = q.order(sortField, {
        ascending: sortDirection === "asc",
        nullsFirst: false,
      });
      if (sortField === "last_name")
        q = q.order("first_name", { ascending: sortDirection === "asc" });
      return q.order("id").range(from, to);
    },
    [status, boardingFilter, search, sortField, sortDirection],
  );
  const {
    rows: visibleRecords,
    total: recordTotal,
    loading,
    error: recordError,
  } = usePagedQuery<Resident>({
    page,
    pageSize: PAGE_SIZE,
    onPageChange: setPage,
    query: recordQuery,
    enabled: activeTab === "records",
    refreshKey,
  });
  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);
  useEffect(() => {
    setPage(1);
  }, [search, status, boardingFilter, sortField, sortDirection]);
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
  const refresh = async () => {
    await fetchData(true);
    setRefreshKey((value) => value + 1);
  };
  const stats = summary.stats;
  const todayAppointments = summary.appointments.today;
  const pendingServices = summary.appointments.pending;
  const activeAnnouncements = summary.announcements.published;
  const recentResidents = summary.recentResidents;
  const profileName = adminProfile?.full_name?.trim() || "Administrator";
  const mobileRef = useDialogFocus<HTMLElement>(mobileOpen, () =>
    setMobileOpen(false),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#admin-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("admin-main")?.focus();
        }}
        className="sr-only z-[150] rounded-xl bg-pine-800 p-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur lg:pl-72">
        <div className="flex min-h-20 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="shrink-0 rounded-xl border border-slate-200 p-2.5 text-slate-700 lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-navigation"
            >
              <Menu size={21} />
            </button>
            <a
              href="#/admin/dashboard?tab=dashboard"
              aria-label="Barangay Old Lucban — Home"
              title="Go to Home"
              className="group rounded-lg"
            >
              <p className="page-eyebrow underline-offset-4 group-hover:underline">
                Barangay Old Lucban
              </p>
              <p className="mt-1 text-sm font-semibold text-pine-900">
                Administrator Portal
              </p>
            </a>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="icon-button"
              aria-label="Refresh"
            >
              <RefreshCw
                className={refreshing ? "animate-spin" : ""}
                size={18}
              />
            </button>
            <a
              href="#/admin/dashboard?tab=account"
              className={`hidden items-center gap-3 rounded-xl border px-3 py-2 sm:flex ${activeTab === "account" ? "border-pine-300 bg-pine-50" : "border-slate-200 bg-white"}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine-700 font-bold text-white">
                {profileName.charAt(0).toUpperCase()}
              </span>
              <span className="text-left">
                <span
                  className="block max-w-36 truncate text-sm font-bold xl:max-w-52"
                  title={profileName}
                >
                  {profileName}
                </span>
                <span className="block text-xs text-slate-500">
                  Profile / Account
                </span>
              </span>
            </a>
          </div>
        </div>
      </header>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <div className="mb-6 shrink-0 border-b border-slate-200 pb-6 pt-1">
          <BarangayBrand
            compact
            subtitle="Administrator Portal"
            homeHref="#/admin/dashboard?tab=dashboard"
          />
        </div>
        <p className="page-eyebrow mb-3 shrink-0 px-4">Workspace</p>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <AdminNavLinks activeTab={activeTab} />
        </nav>
        <div className="mt-4 shrink-0 border-t border-slate-200 pt-4">
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
            className="menu-backdrop absolute inset-0 bg-slate-950/50"
          />
          <aside
            ref={mobileRef}
            tabIndex={-1}
            id="admin-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Administrator navigation"
            className="mobile-drawer relative flex h-full w-[min(88vw,320px)] flex-col bg-slate-50 p-5 shadow-2xl"
          >
            <div className="mb-6 flex shrink-0 items-center justify-between gap-3">
              <BarangayBrand
                compact
                subtitle="Administrator Portal"
                homeHref="#/admin/dashboard?tab=dashboard"
                onHome={() => setMobileOpen(false)}
              />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close administrator menu"
                className="icon-button"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              <AdminNavLinks
                activeTab={activeTab}
                onSelect={() => setMobileOpen(false)}
              />
              <a
                href="#/admin/dashboard?tab=account"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${activeTab === "account" ? "bg-pine-700 text-white" : "text-slate-600 hover:bg-pine-50"}`}
              >
                <UserCog size={18} />
                Profile / Account
              </a>
            </nav>
            <button
              type="button"
              onClick={onLogout}
              className="mt-4 flex w-full shrink-0 items-center gap-3 border-t border-slate-200 px-4 py-4 text-sm font-bold text-red-700"
            >
              <LogOut size={18} />
              Logout
            </button>
          </aside>
        </div>
      )}
      <main
        id="admin-main"
        tabIndex={-1}
        className="mx-auto min-w-0 max-w-[1600px] space-y-6 px-4 py-8 outline-none sm:px-6 lg:ml-72 lg:px-8"
      >
        {(error || (activeTab === "records" && recordError)) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error || (activeTab === "records" ? recordError : null)}
          </div>
        )}
        {activeTab === "dashboard" && (
          <>
            <div className="pb-1">
              <p className="page-eyebrow">Your barangay workspace</p>
              <h1 className="page-title mt-2">Barangay overview</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Resident records, service requests, and the tasks that need your
                attention.
              </p>
            </div>
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
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-pine-300 hover:bg-pine-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine-100 text-pine-700">
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0 flex-1 font-bold text-slate-800">
                        {action.label}
                      </span>
                      {action.count !== null && (
                        <span className="shrink-0 rounded-full bg-pine-700 px-2.5 py-1 text-xs font-bold text-white">
                          {action.count}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </section>
            <RecentServices refreshKey={refreshKey} />
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Recent Updates</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Latest submitted or updated census records.
                  </p>
                </div>
                <a
                  href="#/admin/dashboard?tab=records"
                  className="text-sm font-bold text-pine-700"
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
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{fullName(resident)}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[resident.status]}`}
                        >
                          {STATUS_LABELS[resident.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {resident.tracking_number} ·{" "}
                        {boardingStatusLabel(resident.boarding_status)} ·
                        Updated{" "}
                        {formatDate(
                          resident.updated_at ?? resident.submitted_at,
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onReview(resident.id)}
                      className="shrink-0 rounded-xl bg-pine-700 px-4 py-2 text-sm font-bold text-white"
                    >
                      View
                    </button>
                  </article>
                ))}
                {!recentResidents.length && !loadingSummary && (
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
                <FileSearch className="text-pine-700" />
                <div>
                  <h2 className="text-xl font-bold">Resident Records</h2>
                  <p className="text-sm text-slate-500">
                    Search, sort, open, approve, or reject census records.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_200px]">
                <label className="relative">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, tracking number, address, boarding status"
                    aria-label="Search resident records"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm"
                  />
                </label>
                <select
                  aria-label="Census status"
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
                <select
                  aria-label="Boarding status filter"
                  value={boardingFilter}
                  onChange={(event) =>
                    setBoardingFilter(
                      event.target.value as "all" | BoardingStatus,
                    )
                  }
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="all">All Residents</option>
                  {BOARDING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value === "boarder"
                        ? "Boarders"
                        : option.value === "landlord"
                          ? "Landlords/Landladies"
                          : "Neither"}
                    </option>
                  ))}
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
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold">{fullName(resident)}</h3>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {boardingStatusLabel(resident.boarding_status)}
                          </span>
                          <span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">
                            {resident.residence_classification === "resident"
                              ? "Resident"
                              : resident.residence_classification ===
                                  "temporary"
                                ? "Temporary resident"
                                : "Residence date not recorded"}
                          </span>
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
                        className="shrink-0 rounded-xl bg-pine-700 px-4 py-2.5 text-sm font-bold text-white"
                      >
                        Open Record
                      </button>
                    </article>
                  ))}
                  {!visibleRecords.length && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
                      No matching resident records.
                    </div>
                  )}
                  <PaginationControls
                    page={page}
                    totalItems={recordTotal}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </div>
          </section>
        )}
        {activeTab === "analytics" && (
          <AdminAnalytics refreshKey={refreshKey} />
        )}{" "}
        {activeTab === "announcements" && (
          <AdminAnnouncements
            adminProfileId={adminProfile?.id}
            refreshKey={refreshKey}
          />
        )}{" "}
        {activeTab === "housing" && <HousingManager admin />}
        {(activeTab === "appointments" ||
          activeTab === "history" ||
          activeTab === "services") && (
          <AdminAppointments
            key={activeTab}
            onChanged={() => void fetchData(true)}
            refreshKey={refreshKey}
            mode={
              activeTab === "history"
                ? "history"
                : activeTab === "services"
                  ? "services"
                  : "active"
            }
          />
        )}{" "}
        {activeTab === "account" && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-pine-700">
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
