import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Edit3,
  FileText,
  Home,
  ImageOff,
  LogOut,
  Maximize2,
  Megaphone,
  Menu,
  RefreshCw,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { useDismissible } from "../hooks/useDismissible";
import { useDialogFocus } from "../hooks/useDialogFocus";
import HousingManager from "../components/HousingManager";
import BarangayBrand from "../components/BarangayBrand";
import ResidencyDetails from "../components/ResidencyDetails";
import ResidentAppointments from "../components/ResidentAppointments";
import ResidentNotifications from "../components/ResidentNotifications";
import AnnouncementSections from "../components/AnnouncementSections";
import { categoryLabel, educationStatusLabel } from "../lib/displayLabels";
import type {
  Announcement,
  AnnouncementPriority,
  GovernmentId,
  Remark,
  Resident,
  ResidentStatus,
} from "../types/database";

interface Props {
  onLogout: () => void;
  onEdit: () => void;
}
type Tab = "home" | "appointments" | "profile" | "record" | "housing";
type AnnouncementView = Announcement & { imageUrl?: string | null };
interface ResidentCategoryView {
  name: string;
  indigenous_group?: string | null;
  other_description?: string | null;
}
interface ResidentImages {
  household: string | null;
  idFront: string | null;
  idBack: string | null;
  face: string | null;
}

const STATUS_CONFIG: Record<
  ResidentStatus,
  {
    label: string;
    description: string;
    badgeClass: string;
    iconClass: string;
    backgroundClass: string;
  }
> = {
  pending_review: {
    label: "Pending Review",
    description: "Your census record is waiting for administrator checking.",
    badgeClass: "bg-amber-100 text-amber-800",
    iconClass: "text-amber-700",
    backgroundClass: "bg-amber-100",
  },
  verified: {
    label: "Approved",
    description: "Your census record is approved and active.",
    badgeClass: "bg-sage-100 text-sage-800",
    iconClass: "text-sage-700",
    backgroundClass: "bg-sage-100",
  },
  returned: {
    label: "Needs Update",
    description: "This legacy record requires changes before approval.",
    badgeClass: "bg-pine-100 text-pine-800",
    iconClass: "text-pine-700",
    backgroundClass: "bg-pine-100",
  },
  rejected: {
    label: "Rejected",
    description:
      "Your census record was rejected. Review the administrator remarks below.",
    badgeClass: "bg-red-100 text-red-800",
    iconClass: "text-red-700",
    backgroundClass: "bg-red-100",
  },
};
const ANNOUNCEMENT_STYLES: Record<AnnouncementPriority, string> = {
  info: "border-pine-200 bg-pine-50",
  important: "border-amber-200 bg-amber-50",
  urgent: "border-red-200 bg-red-50",
};
function formatDate(value?: string | null) {
  if (!value) return "Not provided";
  const d = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value,
  );
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
}
function formatDateTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(d);
}
function display(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "Not provided"
    : String(value);
}

export default function ResidentDashboard({ onLogout, onEdit }: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const [resident, setResident] = useState<Resident | null>(null);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [categories, setCategories] = useState<ResidentCategoryView[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementView[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<ResidentImages>({
    household: null,
    idFront: null,
    idBack: null,
    face: null,
  });
  const [governmentIdType, setGovernmentIdType] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useDismissible<HTMLDivElement>(profileOpen, () =>
    setProfileOpen(false),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (manual = false) => {
      if (!userId) return;
      if (manual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const { data: residentRow, error: residentError } = await supabase
          .from("residents")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (residentError) throw residentError;
        const current = (residentRow ?? null) as Resident | null;
        setResident(current);
        if (!current) {
          setRemarks([]);
          setCategories([]);
          setAnnouncements([]);
          setGovernmentIdType(null);
          setImages({
            household: null,
            idFront: null,
            idBack: null,
            face: null,
          });
          return;
        }

        const [
          remarkResult,
          categoryResult,
          announcementResult,
          idResult,
          faceResult,
        ] = await Promise.all([
          supabase
            .from("remarks")
            .select("*")
            .eq("resident_id", current.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("resident_categories")
            .select("indigenous_group, other_description, categories(name)")
            .eq("resident_id", current.id),
          supabase
            .from("announcements")
            .select("*")
            .eq("is_published", true)
            .eq("archived", false)
            .or(`audience.eq.all,audience.eq.${current.status}`)
            .order("published_at", { ascending: false }),
          supabase
            .from("government_ids")
            .select("*")
            .eq("resident_id", current.id)
            .maybeSingle(),
          supabase
            .from("face_verifications")
            .select("captured_face_url")
            .eq("resident_id", current.id)
            .maybeSingle(),
        ]);
        if (remarkResult.error) throw remarkResult.error;
        if (categoryResult.error) throw categoryResult.error;
        if (announcementResult.error) throw announcementResult.error;
        if (idResult.error) throw idResult.error;
        if (faceResult.error) throw faceResult.error;

        setRemarks((remarkResult.data ?? []) as Remark[]);
        setCategories(
          (categoryResult.data ?? []).map((row: any) => ({
            name: categoryLabel(
              (Array.isArray(row.categories)
                ? row.categories[0]?.name
                : row.categories?.name) ?? "Unknown classification",
            ),
            indigenous_group: row.indigenous_group ?? null,
            other_description: row.other_description ?? null,
          })),
        );

        const active = (
          (announcementResult.data ?? []) as Announcement[]
        ).filter(
          (announcement) =>
            !announcement.expires_at ||
            new Date(announcement.expires_at).getTime() > Date.now(),
        );
        const signedAnnouncements = await Promise.all(
          active.map(async (announcement) => {
            if (!announcement.image_path)
              return { ...announcement, imageUrl: null };
            const { data, error: imageError } = await supabase.storage
              .from("announcement-images")
              .createSignedUrl(announcement.image_path, 300);
            return {
              ...announcement,
              imageUrl: imageError ? null : (data?.signedUrl ?? null),
            };
          }),
        );
        setAnnouncements(signedAnnouncements);

        const governmentId = idResult.data as GovernmentId | null;
        setGovernmentIdType(governmentId?.id_type ?? null);
        const signed = async (bucket: string, path?: string | null) => {
          if (!path) return null;
          const { data, error: signedError } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, 3600);
          return signedError ? null : (data?.signedUrl ?? null);
        };
        const [household, idFront, idBack, face] = await Promise.all([
          signed("household-images", current.household_photo_url),
          signed("resident-verification", governmentId?.front_image_url),
          signed("resident-verification", governmentId?.back_image_url),
          signed("resident-verification", faceResult.data?.captured_face_url),
        ]);
        setImages({ household, idFront, idBack, face });
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load your census record.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    const dashboardNotice = sessionStorage.getItem("residentDashboardNotice");
    if (dashboardNotice) {
      setNotice(dashboardNotice);
      sessionStorage.removeItem("residentDashboardNotice");
    }
    void load();
  }, [load]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [load]);

  const fullName = useMemo(
    () =>
      resident
        ? [
            resident.first_name,
            resident.middle_name,
            resident.last_name,
            resident.suffix,
          ]
            .filter(Boolean)
            .join(" ")
        : "Resident",
    [resident],
  );
  const mobileRef = useDialogFocus<HTMLElement>(
    mobileOpen,
    () => setMobileOpen(false),
    768,
  );
  const imagePreviewRef = useDialogFocus<HTMLDivElement>(
    Boolean(previewImage),
    () => setPreviewImage(null),
    null,
  );
  const goHome = () => {
    setTab("home");
    setMobileOpen(false);
    setProfileOpen(false);
  };
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <RefreshCw className="animate-spin text-pine-700" />
      </div>
    );
  const status = resident?.status ?? "pending_review";
  const statusConfig = STATUS_CONFIG[status];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#resident-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("resident-main")?.focus();
        }}
        className="sr-only z-[150] rounded-xl bg-pine-800 p-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BarangayBrand
              compact
              subtitle="Resident Portal"
              homeHref="#/resident/dashboard"
              onHome={goHome}
            />
          </div>
          <div className="relative flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="resident-mobile-navigation"
              className="icon-button md:hidden"
            >
              <Menu size={20} />
            </button>
            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              aria-label="Refresh dashboard"
              className="icon-button hidden sm:inline-flex"
            >
              <RefreshCw
                className={refreshing ? "animate-spin" : ""}
                size={18}
              />
            </button>
            <ResidentNotifications
              residentId={resident?.id}
              onOpenAppointments={() => setTab("appointments")}
              onOpenRecord={() => setTab(resident ? "record" : "home")}
            />
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-label="Open account menu"
                aria-expanded={profileOpen}
                aria-controls="resident-account-menu"
                className={`hidden items-center gap-2 rounded-xl border px-3 py-2 md:flex ${tab === "profile" ? "border-pine-300 bg-pine-50" : "border-slate-200 bg-white"}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pine-700 font-bold text-white">
                  {fullName.charAt(0).toUpperCase()}
                </span>
                <span className="max-w-40 truncate text-sm font-bold">
                  {fullName}
                </span>
              </button>
              {profileOpen && (
                <div
                  id="resident-account-menu"
                  className="absolute right-0 top-14 hidden w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:block"
                >
                  <div className="border-b border-slate-200 px-4 py-3">
                    <p className="truncate text-sm font-bold text-pine-900">
                      {fullName}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {user?.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("profile");
                      setProfileOpen(false);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-pine-50"
                  >
                    <User size={17} /> View profile
                  </button>
                  {resident && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab("record");
                        setProfileOpen(false);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-pine-50"
                    >
                      <FileText size={17} /> Census record
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-3 border-t border-slate-200 px-4 py-3 text-left text-sm font-bold text-red-700 hover:bg-red-50"
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-2 border-t border-slate-100 px-4 py-3 md:flex sm:px-6">
          {[
            { value: "home" as Tab, label: "Home", icon: Home },
            { value: "profile" as Tab, label: "Profile", icon: User },
            { value: "housing" as Tab, label: "Boarding Houses", icon: Home },
            {
              value: "appointments" as Tab,
              label: "Appointments",
              icon: CalendarDays,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                onClick={() => setTab(item.value)}
                aria-current={tab === item.value ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item.value ? "bg-pine-100 text-pine-900" : "text-slate-600 hover:bg-pine-50 hover:text-pine-700"}`}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="menu-backdrop absolute inset-0 bg-slate-950/50"
          />
          <aside
            ref={mobileRef}
            tabIndex={-1}
            id="resident-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Resident navigation"
            className="mobile-drawer relative flex h-full w-[min(88vw,320px)] flex-col bg-slate-50 p-5 shadow-2xl"
          >
            <div className="mb-6 flex shrink-0 items-center justify-between gap-3">
              <BarangayBrand
                compact
                subtitle="Resident Portal"
                homeHref="#/resident/dashboard"
                onHome={goHome}
              />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close resident menu"
                className="icon-button"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {[
                { value: "home" as Tab, label: "Home", icon: Home },
                { value: "profile" as Tab, label: "Profile", icon: User },
                {
                  value: "housing" as Tab,
                  label: "Boarding Houses",
                  icon: Home,
                },
                {
                  value: "appointments" as Tab,
                  label: "Appointments",
                  icon: CalendarDays,
                },
                {
                  value: "record" as Tab,
                  label: "Record Summary",
                  icon: FileText,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() => {
                      setTab(item.value);
                      setMobileOpen(false);
                    }}
                    aria-current={tab === item.value ? "page" : undefined}
                    className={`nav-item w-full ${tab === item.value ? "nav-item-active" : ""}`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                void load(true);
              }}
              className="nav-item mt-2 w-full shrink-0"
            >
              <RefreshCw size={18} /> Refresh dashboard
            </button>
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
        id="resident-main"
        tabIndex={-1}
        className="mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-8 outline-none sm:px-6"
      >
        {tab === "home" && (
          <div className="pb-1">
            <p className="page-eyebrow">Your community, in one place</p>
            <h1 className="page-title mt-2">
              Welcome, {resident?.first_name || "Resident"}.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Keep your information current, manage appointments, and follow
              barangay updates.
            </p>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-3 rounded-2xl border border-sage-200 bg-sage-50 p-4 text-sm text-sage-800">
            <CheckCircle2 size={19} />
            <div className="flex-1">{notice}</div>
            <button aria-label="Dismiss notice" onClick={() => setNotice(null)}>
              <XCircle size={18} />
            </button>
          </div>
        )}
        {error && (
          <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={19} />
            {error}
          </div>
        )}

        {tab === "housing" && <HousingManager />}
        {(tab === "home" || tab === "profile" || tab === "record") &&
          resident && (
            <ResidencyDetails residentId={resident.id} onRecordStart={onEdit} />
          )}
        {tab === "appointments" && <ResidentAppointments resident={resident} />}
        {tab === "profile" && (
          <Profile
            resident={resident}
            accountEmail={user?.email ?? ""}
            categories={categories}
            governmentIdType={governmentIdType}
            images={images}
            onOpenImage={(title, url) => setPreviewImage({ title, url })}
            onEdit={onEdit}
          />
        )}
        {tab === "record" && resident && (
          <RecordSummary
            resident={resident}
            categories={categories}
            onEdit={onEdit}
            onBack={() => setTab("home")}
          />
        )}

        {tab === "home" && (
          <>
            {announcements.length > 0 && (
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pine-100 text-pine-700">
                      <Megaphone size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">
                        Barangay Announcements
                      </h2>
                      <p className="text-sm text-slate-500">
                        Official notices from the Barangay Administrator
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 p-5 sm:p-6">
                  <AnnouncementSections items={announcements}>
                    {(a, recent) => {
                    const long = a.message.length > 240;
                    const open = expanded.has(a.id);
                    return (
                      <article
                        key={a.id}
                        className={`min-w-0 rounded-2xl border p-5 ${ANNOUNCEMENT_STYLES[a.priority]} ${recent ? "ring-2 ring-pine-300/70 shadow-sm" : ""}`}
                      >
                        {a.imageUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                title: a.title,
                                url: a.imageUrl as string,
                              })
                            }
                            className="mb-4 block w-full overflow-hidden rounded-2xl bg-white/70"
                          >
                            <img
                              src={a.imageUrl}
                              alt={`Attached image for ${a.title}`}
                              className="aspect-[16/7] w-full object-cover"
                            />
                          </button>
                        )}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold uppercase tracking-[0.16em]">
                              {a.priority === "info"
                                ? "Information"
                                : a.priority}
                            </p>
                            <h3 className="mt-1 text-lg font-bold text-slate-900">
                              {a.title}
                            </h3>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                            {recent && <span className="rounded-full bg-pine-800 px-2.5 py-1 text-xs font-bold text-white">Recent</span>}
                            <time className="text-xs font-medium text-slate-500">
                              {formatDateTime(a.published_at)}
                            </time>
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {long && !open
                            ? `${a.message.slice(0, 240).trim()}…`
                            : a.message}
                        </p>
                        {long && (
                          <button
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(a.id)) next.delete(a.id);
                                else next.add(a.id);
                                return next;
                              })
                            }
                            className="mt-2 text-sm font-bold text-pine-700"
                          >
                            {open ? "Show Less" : "See More"}
                          </button>
                        )}
                      </article>
                    );
                    }}
                  </AnnouncementSections>
                </div>
              </section>
            )}
            {!resident ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h2 className="text-2xl font-bold">
                  Complete your census record
                </h2>
                <p className="mt-2 text-slate-500">
                  No census submission is connected to this account yet.
                </p>
                <button
                  onClick={onEdit}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-pine-700 px-5 py-3 font-bold text-white"
                >
                  <Edit3 size={18} />
                  Complete Census Form
                </button>
              </section>
            ) : (
              <>
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="grid gap-5 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm font-medium text-slate-500">
                          Application Status
                        </p>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${statusConfig.badgeClass}`}
                        >
                          {statusConfig.label}
                        </span>
                      </div>
                      <h2 className="mt-2 text-2xl font-bold">{fullName}</h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {statusConfig.description}
                      </p>
                    </div>
                    <button
                      onClick={onEdit}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-pine-600 px-5 py-3 font-semibold text-white"
                    >
                      <Edit3 size={18} />
                      Update Census
                    </button>
                  </div>
                  <div className="grid border-t border-slate-100 bg-slate-50/70 sm:grid-cols-2">
                    <div className="px-6 py-5 sm:px-8">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Tracking Number
                      </p>
                      <p className="mt-1 text-lg font-bold text-pine-700">
                        {display(resident.tracking_number)}
                      </p>
                    </div>
                    <div className="border-t border-slate-200 px-6 py-5 sm:border-l sm:border-t-0 sm:px-8">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Date Submitted
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-800">
                        {formatDate(resident.submitted_at)}
                      </p>
                    </div>
                  </div>
                </section>
                <button
                  type="button"
                  onClick={() => setTab("record")}
                  className="flex w-full flex-col items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-pine-300 hover:shadow-md sm:flex-row sm:items-center sm:p-8"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pine-100 text-pine-700">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Record Summary
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Open your complete census information.
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-pine-700">
                    View details →
                  </span>
                </button>
                {remarks.length > 0 && (
                  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <h2 className="text-lg font-bold">Administrator Remarks</h2>
                    <div className="mt-4 space-y-3">
                      {remarks.map((r) => (
                        <article
                          key={r.id}
                          className="rounded-2xl bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap justify-between gap-3">
                            <span className="text-xs font-bold uppercase text-slate-500">
                              {r.status_change.replaceAll("_", " ")}
                            </span>
                            <time className="text-xs text-slate-500">
                              {formatDate(r.created_at)}
                            </time>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            {r.remark_text}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">Submitted Photos</h2>
                    <span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-bold text-pine-700">
                      ID type: {display(governmentIdType)}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <ImageCard
                      title="Household Photo"
                      url={images.household}
                      onOpen={(url) =>
                        setPreviewImage({ title: "Household Photo", url })
                      }
                    />
                    <ImageCard
                      title="Government ID Front"
                      url={images.idFront}
                      onOpen={(url) =>
                        setPreviewImage({ title: "Government ID Front", url })
                      }
                    />
                    <ImageCard
                      title="Government ID Back"
                      url={images.idBack}
                      onOpen={(url) =>
                        setPreviewImage({ title: "Government ID Back", url })
                      }
                    />
                    <ImageCard
                      title="Captured Live Face"
                      url={images.face}
                      onOpen={(url) =>
                        setPreviewImage({ title: "Captured Live Face", url })
                      }
                    />
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
      {previewImage && (
        <div
          ref={imagePreviewRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${previewImage.title} image preview`}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPreviewImage(null);
          }}
        >
          <button
            type="button"
            aria-label="Close image preview"
            onClick={() => setPreviewImage(null)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900"
          >
            <X size={20} />
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.title}
            className="max-h-[calc(100dvh-9rem)] max-w-full rounded-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}

function Profile({
  resident,
  accountEmail,
  categories,
  governmentIdType,
  images,
  onOpenImage,
  onEdit,
}: {
  resident: Resident | null;
  accountEmail: string;
  categories: ResidentCategoryView[];
  governmentIdType: string | null;
  images: ResidentImages;
  onOpenImage: (title: string, url: string) => void;
  onEdit: () => void;
}) {
  if (!resident)
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold">Resident Profile</h2>
        <p className="mt-2 text-slate-500">
          Complete your census form to create your resident profile.
        </p>
        <button
          onClick={onEdit}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-pine-700 px-5 py-3 font-bold text-white"
        >
          <Edit3 size={18} />
          Complete Census Form
        </button>
      </section>
    );
  const categoryText = categories.length
    ? categories
        .map((category) =>
          [category.name, category.indigenous_group, category.other_description]
            .filter(Boolean)
            .join(": "),
        )
        .join(", ")
    : "None selected";
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-sm font-semibold text-pine-700">
            Account & Census Record
          </p>
          <h2 className="mt-1 text-2xl font-bold">Resident Profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            All information saved in your census record is shown below. Your
            account email remains protected.
          </p>
        </div>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl bg-pine-700 px-5 py-3 font-bold text-white"
        >
          <Edit3 size={18} />
          Update Information
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Account Email (Locked)" value={accountEmail} />
        <Info label="Tracking Number" value={resident.tracking_number} />
        <Info
          label="Census Status"
          value={STATUS_CONFIG[resident.status].label}
        />
        <Info
          label="Date Submitted"
          value={formatDate(resident.submitted_at)}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SummaryCard
          title="Personal Information"
          rows={[
            ["First Name", resident.first_name],
            ["Middle Name", resident.middle_name],
            ["Last Name", resident.last_name],
            ["Suffix", resident.suffix],
            ["Birth Date", formatDate(resident.birth_date)],
            ["Birth Place", resident.birth_place],
            ["Sex", resident.sex],
            ["Civil Status", resident.civil_status],
            ["Religion", resident.religion],
            ["Citizenship", resident.citizenship],
          ]}
        />
        <SummaryCard
          title="Contact & Address"
          rows={[
            ["Region", resident.region],
            ["Province", resident.province],
            ["City / Municipality", resident.city_municipality],
            ["Barangay", resident.barangay],
            ["Residential Address", resident.residential_address],
            ["Contact Number", resident.contact_number],
            ["Email Address", accountEmail],
          ]}
        />
        <SummaryCard
          title="Education & Occupation"
          rows={[
            ["Highest Education", resident.highest_education],
            [
              "Education Status",
              educationStatusLabel(resident.education_status),
            ],
            ["Profession / Occupation", resident.profession_occupation],
          ]}
        />
        <SummaryCard
          title="Housing & Resident Classification"
          rows={[
            ["Tenurial Status", resident.tenurial_status],
            [
              "Monthly Rent",
              resident.monthly_rent != null
                ? `₱${Number(resident.monthly_rent).toLocaleString("en-PH")}`
                : null,
            ],
            ["Resident Classification", categoryText],
            ["Last Updated", formatDate(resident.updated_at)],
          ]}
        />
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Submitted Verification Photos</h3>
            <p className="mt-1 text-sm text-slate-500">
              The identification and household photos connected to your record.
            </p>
          </div>
          <span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-bold text-pine-700">
            ID type: {display(governmentIdType)}
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ImageCard
            title="Household Photo"
            url={images.household}
            onOpen={(url) => onOpenImage("Household Photo", url)}
          />
          <ImageCard
            title="Government ID Front"
            url={images.idFront}
            onOpen={(url) => onOpenImage("Government ID Front", url)}
          />
          <ImageCard
            title="Government ID Back"
            url={images.idBack}
            onOpen={(url) => onOpenImage("Government ID Back", url)}
          />
          <ImageCard
            title="Captured Live Face"
            url={images.face}
            onOpen={(url) => onOpenImage("Captured Live Face", url)}
          />
        </div>
      </div>
    </section>
  );
}
function RecordSummary({
  resident,
  categories,
  onEdit,
  onBack,
}: {
  resident: Resident;
  categories: ResidentCategoryView[];
  onEdit: () => void;
  onBack: () => void;
}) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <button onClick={onBack} className="text-sm font-bold text-pine-700">
            ← Back to dashboard
          </button>
          <h2 className="mt-2 text-2xl font-bold">Record Summary</h2>
          <p className="mt-1 text-sm text-slate-500">
            Complete census information currently stored in Supabase.
          </p>
        </div>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl bg-pine-700 px-5 py-3 font-bold text-white"
        >
          <Edit3 size={18} />
          Update Record
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SummaryCard
          title="Personal Information"
          rows={[
            ["First Name", resident.first_name],
            ["Middle Name", resident.middle_name],
            ["Last Name", resident.last_name],
            ["Suffix", resident.suffix],
            ["Birth Date", formatDate(resident.birth_date)],
            ["Birth Place", resident.birth_place],
            ["Sex", resident.sex],
            ["Civil Status", resident.civil_status],
            ["Religion", resident.religion],
            ["Citizenship", resident.citizenship],
          ]}
        />
        <SummaryCard
          title="Contact & Address"
          rows={[
            ["Region", resident.region],
            ["Province", resident.province],
            ["City / Municipality", resident.city_municipality],
            ["Barangay", resident.barangay],
            ["Residential Address", resident.residential_address],
            ["Contact Number", resident.contact_number],
            ["Email Address", resident.email_address],
          ]}
        />
        <SummaryCard
          title="Education & Occupation"
          rows={[
            ["Highest Education", resident.highest_education],
            [
              "Education Status",
              educationStatusLabel(resident.education_status),
            ],
            ["Profession / Occupation", resident.profession_occupation],
          ]}
        />
        <SummaryCard
          title="Housing & Resident Classification"
          rows={[
            ["Tenurial Status", resident.tenurial_status],
            [
              "Monthly Rent",
              resident.monthly_rent != null
                ? `₱${Number(resident.monthly_rent).toLocaleString("en-PH")}`
                : null,
            ],
            [
              "Resident Classification",
              categories.length
                ? categories
                    .map((category) =>
                      [
                        category.name,
                        category.indigenous_group,
                        category.other_description,
                      ]
                        .filter(Boolean)
                        .join(": "),
                    )
                    .join(", ")
                : "None selected",
            ],
          ]}
        />
      </div>
    </section>
  );
}
function SummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, unknown]>;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold">{title}</h3>
      <dl className="mt-5 space-y-4">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 border-b border-slate-100 pb-3 last:border-0"
          >
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </dt>
            <dd className="font-semibold text-slate-800">{display(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-semibold capitalize text-slate-800">
        {display(value)}
      </dd>
    </div>
  );
}
function ImageCard({
  title,
  url,
  onOpen,
}: {
  title: string;
  url: string | null;
  onOpen: (url: string) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="aspect-[4/3] bg-slate-100">
        {url ? (
          <button onClick={() => onOpen(url)} className="h-full w-full">
            <img
              src={url}
              alt={title}
              className="h-full w-full object-contain p-2"
            />
          </button>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-slate-400">
            <ImageOff size={30} />
            <span className="mt-2 text-sm">No image available</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between p-4">
        <h3 className="font-bold">{title}</h3>
        {url && (
          <button
            onClick={() => onOpen(url)}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600"
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
    </article>
  );
}
