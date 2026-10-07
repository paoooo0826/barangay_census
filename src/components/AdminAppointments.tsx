import AppointmentPaymentPanel from "./AppointmentPaymentPanel";
import { updateHashQuery, useHashRoute } from "../hooks/useHashRoute";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CircleCheckBig,
  Clock,
  Eye,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type {
  Appointment,
  AppointmentStatus,
  StoredAppointmentService,
} from "../types/database";
import { RESIDENCY_PURPOSES, serviceLabel } from "./ResidentAppointments";
import SortControls from "./SortControls";
import { usePagedQuery, searchPattern } from "../hooks/usePagedQuery";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { EMPTY_ADMIN_SUMMARY, type AdminSummary } from "../lib/adminData";
import { type SortDirection } from "../lib/sorting";
import PaginationControls from "./PaginationControls";

interface AdminAppointmentsProps {
  refreshKey: number;
  mode?: "active" | "history" | "services";
  onChanged?: () => void;
}
interface AppointmentResident {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  tracking_number?: string | null;
  contact_number?: string | null;
  email_address?: string | null;
}
interface AdminAppointment extends Appointment {
  residents?: AppointmentResident | AppointmentResident[] | null;
}
const PAGE_SIZE = 8;

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-pine-100 text-pine-800",
  completed: "bg-sage-100 text-sage-800",
  cancelled: "bg-slate-100 text-slate-700",
  rejected: "bg-red-100 text-red-800",
};
function localDateValue(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
}
function formatTime(value: string) {
  const [h, m] = value.slice(0, 5).split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}
function formatFee(value: number) {
  return Number(value) === 0
    ? "Free"
    : new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 0,
      }).format(Number(value));
}
function residentFrom(a: AdminAppointment) {
  return Array.isArray(a.residents)
    ? (a.residents[0] ?? null)
    : (a.residents ?? null);
}
function fullName(r: AppointmentResident | null) {
  return r
    ? [r.first_name, r.middle_name, r.last_name, r.suffix]
        .filter(Boolean)
        .join(" ")
    : "Resident record unavailable";
}
function purposeLabel(a: AdminAppointment) {
  if (!a.service_purpose) return null;
  return (
    RESIDENCY_PURPOSES.find((p) => p.value === a.service_purpose)?.label ??
    a.service_purpose.replaceAll("_", " ")
  );
}

export default function AdminAppointments({
  refreshKey,
  mode = "active",
  onChanged,
}: AdminAppointmentsProps) {
  const route = useHashRoute();
  const requestedFilters = new URLSearchParams(route.split("?")[1] ?? "");
  const [metrics, setMetrics] = useState(EMPTY_ADMIN_SUMMARY.appointments);
  const detailRequest = useRef(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const searchQuery = requestedFilters.get("q") ?? "";
  const requestedStatus = requestedFilters.get("status");
  const allowed =
    mode === "active"
      ? ["all", "pending", "confirmed"]
      : mode === "history"
        ? ["all", "completed", "cancelled", "rejected"]
        : ["all", "pending", "confirmed", "completed", "cancelled", "rejected"];
  const statusFilter: "all" | AppointmentStatus = allowed.includes(
    requestedStatus ?? "",
  )
    ? (requestedStatus as "all" | AppointmentStatus)
    : mode === "history"
      ? "completed"
      : "all";
  const requestedDate = requestedFilters.get("date") ?? "";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? new Date(`${requestedDate}T12:00:00Z`)
    : null;
  const dateFilter =
    requestedDate === "today"
      ? localDateValue()
      : parsedDate &&
          !Number.isNaN(parsedDate.getTime()) &&
          parsedDate.toISOString().slice(0, 10) === requestedDate
        ? requestedDate
        : "";
  const appointmentId = requestedFilters.get("appointment");
  const setStatusFilter = (value: string) => updateHashQuery({ status: value });
  const setDateFilter = (value: string) => updateHashQuery({ date: value });
  const setSearchQuery = (value: string) => updateHashQuery({ q: value }, true);
  const [sortField, setSortField] = useState("appointment_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    mode === "active" ? "asc" : "desc",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedAppointment, setSelectedAppointment] =
    useState<AdminAppointment | null>(null);

  const appointmentQuery = useCallback(
    (from: number, to: number) => {
      let q = supabase
        .from("admin_service_records")
        .select("*", { count: "exact" })
        .in(
          "status",
          mode === "active"
            ? ["pending", "confirmed"]
            : mode === "history"
              ? ["completed", "cancelled", "rejected"]
              : ["pending", "confirmed", "completed", "cancelled", "rejected"],
        );
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (dateFilter) q = q.eq("appointment_date", dateFilter);
      if (searchQuery.trim())
        q = q.ilike("search_text", searchPattern(searchQuery));
      const column =
        sortField === "resident"
          ? "resident_sort"
          : sortField === "service"
            ? "service_label"
            : sortField;
      q = q.order(column, {
        ascending: sortDirection === "asc",
        nullsFirst: false,
      });
      if (column === "appointment_date")
        q = q.order("appointment_time", { ascending: sortDirection === "asc" });
      return q.order("id").range(from, to);
    },
    [mode, statusFilter, dateFilter, searchQuery, sortField, sortDirection],
  );
  const {
    rows: visible,
    total,
    loading,
    error: queryError,
    reload: loadAppointments,
  } = usePagedQuery<AdminAppointment>({
    page,
    pageSize: PAGE_SIZE,
    onPageChange: setPage,
    query: appointmentQuery,
    refreshKey,
  });
  const loadMetrics = async () => {
    const { data, error: e } = await supabase.rpc("admin_dashboard_summary", {
      p_mode: mode,
    });
    if (!e) setMetrics((data as unknown as AdminSummary).appointments);
  };
  useEffect(() => {
    let active = true;
    const read = async () => {
      const { data, error: e } = await supabase.rpc("admin_dashboard_summary", {
        p_mode: mode,
      });
      if (active && !e)
        setMetrics((data as unknown as AdminSummary).appointments);
    };
    void read();
    const timer = window.setInterval(() => void read(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mode, refreshKey]);
  useEffect(() => {
    const request = ++detailRequest.current;
    setSelectedAppointment(null);
    if (appointmentId)
      void supabase
        .from("admin_service_records")
        .select("*")
        .eq("id", appointmentId)
        .maybeSingle()
        .then(({ data, error: e }) => {
          if (request !== detailRequest.current) return;
          if (e) setError(e.message);
          else if (!data) setError("This appointment is no longer available.");
          else setSelectedAppointment(data as AdminAppointment);
        });
    return () => {
      ++detailRequest.current;
    };
  }, [mode, refreshKey, appointmentId]);
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, dateFilter, sortField, sortDirection]);

  const closeAppointment = () => {
    setSelectedAppointment(null);
    updateHashQuery({ appointment: null });
  };
  async function updateStatus(a: AdminAppointment, status: AppointmentStatus) {
    let adminNotes = a.admin_notes ?? null;
    if (status === "rejected") {
      const reason = window.prompt(
        "Enter the reason for rejecting this appointment:",
      );
      if (reason === null) return;
      if (reason.trim().length < 3) {
        setError("Enter a short reason before rejecting the appointment.");
        return;
      }
      adminNotes = reason.trim();
    }
    setUpdatingId(a.id);
    setError(null);
    setSuccess(null);
    const { data, error: updateError } = await supabase.rpc(
      "transition_appointment",
      {
        p_appointment_id: a.id,
        p_expected_status: a.status,
        p_new_status: status,
        p_admin_notes: adminNotes,
      },
    );
    setUpdatingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const result = data as { updated?: boolean; conflict?: boolean } | null;
    if (!result?.updated) {
      setError(
        result?.conflict
          ? "This appointment changed in another session. The list has been refreshed."
          : "The appointment could not be updated.",
      );
      await loadAppointments();
      return;
    }
    setSuccess(`Appointment marked as ${status}.`);
    onChanged?.();
    await Promise.all([loadAppointments(), loadMetrics()]);
    if (selectedAppointment?.id === a.id) closeAppointment();
  }

  const cards = [
    {
      label:
        mode === "active"
          ? "Active Appointments"
          : mode === "history"
            ? "Previous Appointments"
            : "All Service Requests",
      value: metrics.total,
      icon: CalendarClock,
      style: "bg-pine-100 text-pine-700",
    },
    {
      label: "Today's Schedule",
      value: metrics.today,
      icon: CalendarCheck2,
      style: "bg-pine-100 text-pine-700",
    },
    {
      label: "Completed Today",
      value: metrics.completedToday,
      icon: CircleCheckBig,
      style: "bg-sage-100 text-sage-700",
    },
    {
      label: "Waiting for Confirmation",
      value: metrics.pending,
      icon: Clock,
      style: "bg-amber-100 text-amber-700",
    },
  ].filter((card) => mode !== "active" || card.label !== "Completed Today");

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-pine-700">
              Barangay services
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {mode === "history"
                ? "Appointment History"
                : mode === "services"
                  ? "Service Requests"
                  : "Active Appointments"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === "active"
                ? "Confirm, complete, or reject active resident requests."
                : "View recorded services, status, dates, and request details."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAppointments()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={17} />{" "}
            Refresh
          </button>
        </div>
        <div className="grid gap-4 border-b border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <article
                key={c.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      {c.label}
                    </p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">
                      {c.value}
                    </p>
                  </div>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.style}`}
                  >
                    <Icon size={21} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="p-5 sm:p-6">
          {(error || queryError) && (
            <div className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={18} />
              {error || queryError}
            </div>
          )}
          {success && (
            <div className="mb-4 flex gap-3 rounded-xl border border-sage-200 bg-sage-50 p-4 text-sm text-sage-800">
              <CheckCircle2 size={18} />
              {success}
            </div>
          )}
          {mode === "history" && (
            <div className="mb-4 flex flex-wrap gap-2">
              {(["completed", "cancelled", "rejected"] as const).map(
                (value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold capitalize ${statusFilter === value ? "bg-pine-700 text-white" : "bg-slate-100 text-slate-700"}`}
                  >
                    {value}
                  </button>
                ),
              )}
            </div>
          )}
          <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px_190px]">
            <label className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="search"
                aria-label="Search appointments"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search resident or service"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-pine-500"
              />
            </label>
            <select
              aria-label="Appointment status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | AppointmentStatus)
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="all">All statuses</option>
              {(mode === "active"
                ? ["pending", "confirmed"]
                : mode === "history"
                  ? ["completed", "cancelled", "rejected"]
                  : [
                      "pending",
                      "confirmed",
                      "completed",
                      "cancelled",
                      "rejected",
                    ]
              ).map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="Appointment date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />
          </div>
          <SortControls
            id="appointments"
            field={sortField}
            direction={sortDirection}
            options={[
              { value: "appointment_date", label: "Appointment date and time" },
              { value: "resident", label: "Resident last name" },
              { value: "service", label: "Service" },
              { value: "fee", label: "Fee" },
              { value: "status", label: "Status" },
              { value: "completed_at", label: "Completion date" },
            ]}
            onFieldChange={setSortField}
            onDirectionChange={setSortDirection}
          />
          {loading ? (
            <div className="flex justify-center gap-3 py-16 text-sm text-slate-500">
              <Loader2 className="animate-spin text-pine-700" /> Loading
              appointments…
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {visible.map((a) => {
                const resident = residentFrom(a);
                const busy = updatingId === a.id;
                const p = purposeLabel(a);
                return (
                  <article
                    key={a.id}
                    className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900">
                            {serviceLabel(
                              a.service_type as StoredAppointmentService,
                            )}
                          </h3>
                          {p && (
                            <span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">
                              {p}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[a.status]}`}
                          >
                            {a.status}
                          </span>
                          <span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">
                            {formatFee(a.fee)}
                          </span>
                        </div>
                        <p className="mt-2 font-semibold text-slate-700">
                          {fullName(resident)}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {formatDate(a.appointment_date)} ·{" "}
                          {formatTime(a.appointment_time)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 xl:max-w-[45%] xl:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAppointment(a);
                            updateHashQuery({ appointment: a.id });
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-pine-200 px-4 py-2 text-sm font-bold text-pine-700 hover:bg-pine-50"
                        >
                          <Eye size={16} /> View Details
                        </button>
                        {a.status === "pending" && (
                          <button
                            disabled={busy}
                            onClick={() => void updateStatus(a, "confirmed")}
                            className="rounded-xl bg-pine-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        )}
                        {a.status === "confirmed" && (
                          <button
                            disabled={busy}
                            onClick={() => void updateStatus(a, "completed")}
                            className="rounded-xl bg-sage-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Complete
                          </button>
                        )}
                        {["pending", "confirmed"].includes(a.status) && (
                          <button
                            disabled={busy}
                            onClick={() => void updateStatus(a, "rejected")}
                            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {!visible.length && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">
                  No matching appointments.
                </div>
              )}
              <PaginationControls
                page={page}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </section>
      {selectedAppointment && (
        <AdminAppointmentDetails
          appointment={selectedAppointment}
          onClose={closeAppointment}
        />
      )}
    </>
  );
}

export function AdminAppointmentDetails({
  appointment,
  onClose,
  onPaymentChanged,
}: {
  appointment: AdminAppointment;
  onClose: () => void;
  onPaymentChanged?: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose, null);
  const resident = residentFrom(appointment);
  const purpose = purposeLabel(appointment);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Appointment details"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="dialog-panel w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-pine-700">
              Appointment record
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">
              {serviceLabel(
                appointment.service_type as StoredAppointmentService,
              )}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close appointment details"
            className="icon-button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLES[appointment.status]}`}
            >
              {appointment.status}
            </span>
            {purpose && (
              <span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-bold text-pine-700">
                {purpose}
              </span>
            )}
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <AdminDetail label="Resident" value={fullName(resident)} />
            <AdminDetail
              label="Tracking Number"
              value={resident?.tracking_number ?? "Not available"}
            />
            <AdminDetail
              label="Appointment Date"
              value={formatDate(appointment.appointment_date)}
            />
            <AdminDetail
              label="Appointment Time"
              value={formatTime(appointment.appointment_time)}
            />
            <AdminDetail label="Fee" value={formatFee(appointment.fee)} />
            <AdminDetail label="Status" value={appointment.status} />
            <AdminDetail
              label="Requested"
              value={new Date(appointment.created_at).toLocaleString("en-PH")}
            />
            <AdminDetail
              label="Last Updated"
              value={new Date(appointment.updated_at).toLocaleString("en-PH")}
            />
            {appointment.completed_at && (
              <AdminDetail
                label="Completed"
                value={new Date(appointment.completed_at).toLocaleString(
                  "en-PH",
                )}
              />
            )}
            {appointment.cancelled_at && (
              <AdminDetail
                label="Cancelled"
                value={new Date(appointment.cancelled_at).toLocaleString(
                  "en-PH",
                )}
              />
            )}
            <AdminDetail
              label="Contact Number"
              value={resident?.contact_number ?? "Not available"}
            />
            <AdminDetail
              label="Email Address"
              value={resident?.email_address ?? "Not available"}
            />
          </dl>
          <AppointmentPaymentPanel key={appointment.id} appointment={appointment} admin onChanged={onPaymentChanged} />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <MessageSquareText size={17} className="text-pine-700" />
              Resident request details
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {appointment.purpose}
            </p>
          </div>
          {appointment.admin_notes && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>Administrator remark:</strong>
              <p className="mt-1 whitespace-pre-wrap">
                {appointment.admin_notes}
              </p>
            </div>
          )}
          {appointment.cancellation_reason && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <strong>Resident cancellation reason:</strong>
              <p className="mt-1 whitespace-pre-wrap">
                {appointment.cancellation_reason}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-bold capitalize text-slate-800">{value}</dd>
    </div>
  );
}
