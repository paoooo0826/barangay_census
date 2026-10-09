import AppointmentPaymentPanel from "./AppointmentPaymentPanel";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  Filter,
  Home,
  Loader2,
  MessageSquareText,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import PaginationControls, { pageSlice } from "./PaginationControls";
import type {
  Appointment,
  AppointmentPurpose,
  AppointmentService,
  AppointmentStatus,
  Resident,
  StoredAppointmentService,
} from "../types/database";

interface ResidentAppointmentsProps {
  resident: Resident | null;
  initialService?: AppointmentService | null;
}

interface ServiceDefinition {
  value: AppointmentService;
  label: string;
  description: string;
  feeLabel: string;
  icon: typeof FileCheck2;
  iconClass: string;
}

interface CancellationResult {
  cancelled?: boolean;
  message?: string;
}

interface BookingResult {
  booked?: boolean;
  fee_changed?: boolean;
  current_fee?: number;
}

type AppointmentCategory =
  "upcoming" | "completed" | "rejected" | "cancelled" | "all";

const PAGE_SIZE = 5;

const CATEGORY_OPTIONS: Array<{
  value: AppointmentCategory;
  label: string;
}> = [
  { value: "upcoming", label: "Upcoming / Active" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All Appointments" },
];

export const APPOINTMENT_SERVICES: ServiceDefinition[] = [
  {
    value: "barangay_clearance",
    label: "Barangay Clearance",
    description:
      "Request a clearance for employment, business, or other legal purposes.",
    feeLabel: "₱130 student / ₱230 non-student",
    icon: FileCheck2,
    iconClass: "bg-pine-100 text-pine-700",
  },
  {
    value: "certificate_of_residency",
    label: "Certificate of Residency",
    description:
      "Request a residency certificate for a supported barangay purpose.",
    feeLabel: "₱30 · First Low Income request is free",
    icon: Home,
    iconClass: "bg-amber-100 text-amber-700",
  },
];

export const RESIDENCY_PURPOSES: Array<{
  value: AppointmentPurpose;
  label: string;
}> = [
  { value: "low_income", label: "Low Income" },
  { value: "good_moral", label: "Good Moral Certificate" },
  { value: "financial", label: "Financial" },
  { value: "medical_assistance", label: "Medical Assistance Certificate" },
];

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-pine-100 text-pine-800",
  completed: "bg-sage-100 text-sage-800",
  cancelled: "bg-slate-100 text-slate-700",
  rejected: "bg-red-100 text-red-800",
};

const TIME_SLOTS = [
  ["08:00", "8:00 AM"],
  ["08:30", "8:30 AM"],
  ["09:00", "9:00 AM"],
  ["09:30", "9:30 AM"],
  ["10:00", "10:00 AM"],
  ["10:30", "10:30 AM"],
  ["11:00", "11:00 AM"],
  ["11:30", "11:30 AM"],
  ["13:00", "1:00 PM"],
  ["13:30", "1:30 PM"],
  ["14:00", "2:00 PM"],
  ["14:30", "2:30 PM"],
  ["15:00", "3:00 PM"],
  ["15:30", "3:30 PM"],
  ["16:00", "4:00 PM"],
] as const;

function todayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function timeHasPassed(date: string, time: string) {
  if (date !== todayInputValue()) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return time <= `${value.hour}:${value.minute}`;
}

function formatAppointmentDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatAppointmentTime(value: string) {
  const normalized = value.slice(0, 5);
  return TIME_SLOTS.find(([time]) => time === normalized)?.[1] ?? normalized;
}

function formatFee(fee: number) {
  if (Number(fee) === 0) return "Free";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(Number(fee));
}

export function serviceLabel(value: StoredAppointmentService) {
  const current = APPOINTMENT_SERVICES.find(
    (service) => service.value === value,
  )?.label;
  if (current) return current;
  if (value === "certificate_of_indigency")
    return "Certificate of Indigency (Legacy)";
  if (value === "complaint") return "Complaints (Legacy)";
  return value.replaceAll("_", " ");
}

function purposeLabel(value?: AppointmentPurpose | null) {
  if (!value) return null;
  return (
    RESIDENCY_PURPOSES.find((purpose) => purpose.value === value)?.label ??
    value.replaceAll("_", " ")
  );
}

export default function ResidentAppointments({
  resident,
  initialService,
}: ResidentAppointmentsProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const bookingRequestKey = useRef<string | null>(null);
  const appointmentRequest = useRef(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showBooking, setShowBooking] = useState(Boolean(initialService));
  const [selectedService, setSelectedService] = useState<AppointmentService>(
    initialService ?? "barangay_clearance",
  );
  const [selectedPurpose, setSelectedPurpose] =
    useState<AppointmentPurpose>("low_income");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [details, setDetails] = useState("");
  const [feePreview, setFeePreview] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [category, setCategory] = useState<AppointmentCategory>("upcoming");
  const [page, setPage] = useState(1);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [appointmentLoadError, setAppointmentLoadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAppointments = useCallback(async (background = false) => {
    const generation = ++appointmentRequest.current;
    if (!userId) {
      setAppointments([]);
      return;
    }
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const { data, error: appointmentError } = await supabase
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false });
      if (generation !== appointmentRequest.current) return;
      if (appointmentError) throw appointmentError;
      setAppointmentLoadError(null);
      const fresh = (data ?? []) as Appointment[];
      setAppointments(fresh);
      setSelectedAppointment((current) =>
        current ? fresh.find((item) => item.id === current.id) ?? null : null,
      );
      setCancelTarget((current) =>
        current
          ? fresh.find(
              (item) =>
                item.id === current.id &&
                ["pending", "confirmed"].includes(item.status),
            ) ?? null
          : null,
      );
    } catch (caught) {
      if (generation === appointmentRequest.current)
        setAppointmentLoadError(
          caught && typeof caught === "object" && "message" in caught
            ? String(caught.message)
            : "Unable to refresh appointments. Check your connection and retry.",
        );
    } finally {
      if (generation === appointmentRequest.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadAppointments();
    const refresh = () => {
      if (!document.hidden) void loadAppointments(true);
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      ++appointmentRequest.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadAppointments]);

  useEffect(() => {
    if (!resident || !showBooking) {
      setFeePreview(null);
      return;
    }
    let cancelled = false;
    const loadFee = async () => {
      setFeeLoading(true);
      const { data, error: feeError } = await supabase.rpc(
        "preview_appointment_fee",
        {
          p_resident_id: resident.id,
          p_service_type: selectedService,
          p_service_purpose:
            selectedService === "certificate_of_residency"
              ? selectedPurpose
              : null,
        },
      );
      if (!cancelled) {
        if (feeError) {
          setFeePreview(null);
          setError(feeError.message);
        } else {
          setFeePreview(Number(data));
        }
        setFeeLoading(false);
      }
    };
    void loadFee();
    return () => {
      cancelled = true;
    };
  }, [resident, selectedPurpose, selectedService, showBooking]);

  useEffect(() => {
    bookingRequestKey.current = null;
  }, [
    appointmentDate,
    appointmentTime,
    details,
    selectedPurpose,
    selectedService,
  ]);

  const counts = useMemo(
    () => ({
      upcoming: appointments.filter((appointment) =>
        ["pending", "confirmed"].includes(appointment.status),
      ).length,
      completed: appointments.filter(
        (appointment) => appointment.status === "completed",
      ).length,
      rejected: appointments.filter(
        (appointment) => appointment.status === "rejected",
      ).length,
      cancelled: appointments.filter(
        (appointment) => appointment.status === "cancelled",
      ).length,
      all: appointments.length,
    }),
    [appointments],
  );
  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        if (category === "all") return true;
        if (category === "upcoming")
          return ["pending", "confirmed"].includes(appointment.status);
        return appointment.status === category;
      }),
    [appointments, category],
  );
  const visibleAppointments = pageSlice(filteredAppointments, page, PAGE_SIZE);

  useEffect(() => {
    setPage((current) =>
      Math.min(
        current,
        Math.max(1, Math.ceil(filteredAppointments.length / PAGE_SIZE)),
      ),
    );
  }, [filteredAppointments.length]);

  useEffect(() => {
    setPage(1);
  }, [category]);

  const resetForm = () => {
    setAppointmentDate("");
    setAppointmentTime("");
    setDetails("");
    setSelectedPurpose("low_income");
  };

  const submitAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!user || !resident) {
      setError("Complete your census record before booking an appointment.");
      return;
    }
    if (!appointmentDate || !appointmentTime || details.trim().length < 5) {
      setError(
        "Select a date and time, then provide at least five characters of details.",
      );
      return;
    }
    const chosenDate = new Date(`${appointmentDate}T12:00:00`);
    if (chosenDate.getDay() === 0 || chosenDate.getDay() === 6) {
      setError("Appointments are available from Monday to Friday only.");
      return;
    }
    if (
      appointmentDate < todayInputValue() ||
      timeHasPassed(appointmentDate, appointmentTime)
    ) {
      setError("Choose a future appointment date and time.");
      return;
    }
    if (feePreview == null) {
      setError("Wait for the fee to finish loading before confirming.");
      return;
    }

    setSaving(true);
    bookingRequestKey.current ??= crypto.randomUUID();
    const { data, error: insertError } = await supabase.rpc(
      "book_resident_appointment",
      {
        p_resident_id: resident.id,
        p_service_type: selectedService,
        p_service_purpose:
          selectedService === "certificate_of_residency"
            ? selectedPurpose
            : null,
        p_appointment_date: appointmentDate,
        p_appointment_time: appointmentTime,
        p_purpose: details.trim(),
        p_expected_fee: feePreview,
        p_request_key: bookingRequestKey.current,
      },
    );
    setSaving(false);

    if (insertError) {
      if (insertError.code === "23505")
        setError(
          "You already have an active booking for this service, date, and time.",
        );
      else setError(insertError.message);
      return;
    }

    const result = data as BookingResult | null;
    if (!result?.booked && result?.fee_changed) {
      setFeePreview(Number(result.current_fee));
      setError(
        `The fee changed to ${formatFee(Number(result.current_fee))}. Review it and confirm again.`,
      );
      bookingRequestKey.current = null;
      return;
    }
    if (!result?.booked) {
      setError("The appointment could not be booked. Refresh and try again.");
      return;
    }

    setSuccess("Appointment submitted successfully at the confirmed fee.");
    bookingRequestKey.current = null;
    resetForm();
    setShowBooking(false);
    await loadAppointments();
  };

  const cancelAppointment = async () => {
    if (!cancelTarget) return;
    const reason = cancellationReason.trim();
    if (reason.length < 3) {
      setError("Enter a cancellation reason with at least three characters.");
      return;
    }
    setCancellingId(cancelTarget.id);
    setError(null);
    setSuccess(null);
    const { data, error: cancellationError } = await supabase.rpc(
      "cancel_resident_appointment",
      {
        p_appointment_id: cancelTarget.id,
        p_reason: reason,
      },
    );
    setCancellingId(null);
    if (cancellationError) {
      setError(cancellationError.message);
      return;
    }
    const result = data as CancellationResult | null;
    if (!result?.cancelled) {
      setError(result?.message ?? "The appointment could not be cancelled.");
      return;
    }
    setSuccess(result.message ?? "Appointment cancelled successfully.");
    setCancelTarget(null);
    setCancellationReason("");
    setCategory("cancelled");
    await loadAppointments();
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-pine-700">
            Barangay services
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Appointments
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            View existing requests, previous visits, or book a new appointment
            here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadAppointments()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={17} />{" "}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowBooking((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-pine-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-pine-800"
          >
            {showBooking ? <X size={17} /> : <CalendarPlus size={17} />}
            {showBooking ? "Close Booking" : "Book New"}
          </button>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {error && <Message tone="error" text={error} />}
        {appointmentLoadError && <Message tone="error" text={appointmentLoadError} />}
        {success && <Message tone="success" text={success} />}

        {showBooking && (
          <form
            onSubmit={submitAppointment}
            className="mb-8 rounded-3xl border border-pine-100 bg-pine-50/40 p-5 sm:p-6"
          >
            <div className="mb-5">
              <h3 className="text-xl font-bold text-slate-900">
                Book an appointment
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                The displayed fee is verified again by Supabase when you submit.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {APPOINTMENT_SERVICES.map((service) => {
                const Icon = service.icon;
                const active = selectedService === service.value;
                return (
                  <button
                    key={service.value}
                    type="button"
                    onClick={() => setSelectedService(service.value)}
                    className={`rounded-2xl border p-4 text-left transition ${active ? "border-pine-600 bg-white ring-2 ring-pine-100" : "border-slate-200 bg-white hover:border-pine-300"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${service.iconClass}`}
                      >
                        <Icon size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">
                          {service.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {service.description}
                        </p>
                        <p className="mt-2 text-sm font-bold text-pine-700">
                          {service.feeLabel}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedService === "certificate_of_residency" && (
              <label className="mt-5 block text-sm font-bold text-slate-800">
                Certificate purpose <span className="text-red-600">*</span>
                <select
                  value={selectedPurpose}
                  onChange={(event) =>
                    setSelectedPurpose(event.target.value as AppointmentPurpose)
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-pine-600 focus:ring-4 focus:ring-pine-100"
                >
                  {RESIDENCY_PURPOSES.map((purpose) => (
                    <option key={purpose.value} value={purpose.value}>
                      {purpose.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-800">
                Appointment date <span className="text-red-600">*</span>
                <input
                  type="date"
                  value={appointmentDate}
                  min={todayInputValue()}
                  onChange={(event) => setAppointmentDate(event.target.value)}
                  required
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-pine-600 focus:ring-4 focus:ring-pine-100"
                />
              </label>
              <label className="block text-sm font-bold text-slate-800">
                Appointment time <span className="text-red-600">*</span>
                <select
                  value={appointmentTime}
                  onChange={(event) => setAppointmentTime(event.target.value)}
                  required
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-pine-600 focus:ring-4 focus:ring-pine-100"
                >
                  <option value="">Select a time</option>
                  {TIME_SLOTS.map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={timeHasPassed(appointmentDate, value)}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-5 block text-sm font-bold text-slate-800">
              Request details <span className="text-red-600">*</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                minLength={5}
                maxLength={1000}
                rows={4}
                required
                placeholder="Briefly explain why you need the document."
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-4 font-normal outline-none focus:border-pine-600 focus:ring-4 focus:ring-pine-100"
              />
            </label>

            <div className="mt-6 flex flex-col gap-4 border-t border-pine-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Fee before confirmation
                </p>
                <p className="mt-1 text-2xl font-bold text-pine-800">
                  {feeLoading
                    ? "Checking…"
                    : feePreview == null
                      ? "Unavailable"
                      : formatFee(feePreview)}
                </p>
                {selectedService === "certificate_of_residency" &&
                  selectedPurpose === "low_income" &&
                  feePreview === 0 && (
                    <p className="mt-1 text-xs font-semibold text-sage-700">
                      First Low Income request benefit applied.
                    </p>
                  )}
              </div>
              <button
                type="submit"
                disabled={
                  saving || feeLoading || feePreview == null || !resident
                }
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-pine-800 px-6 font-bold text-white transition hover:bg-pine-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={19} />
                ) : (
                  <CalendarPlus size={19} />
                )}
                {saving ? "Submitting…" : "Confirm Appointment"}
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="All requests" value={counts.all} />
          <Metric label="Upcoming / active" value={counts.upcoming} />
          <Metric label="Completed" value={counts.completed} />
          <Metric
            label="Rejected / cancelled"
            value={counts.rejected + counts.cancelled}
          />
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-pine-700" />
            <h3 className="font-bold text-slate-900">Appointment category</h3>
          </div>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as AppointmentCategory)
            }
            className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-pine-600 focus:ring-4 focus:ring-pine-100"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({counts[option.value]})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 py-10 text-sm text-slate-500">
              <Loader2 className="animate-spin text-pine-700" /> Loading
              appointments…
            </div>
          ) : visibleAppointments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              No appointments in this category.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAppointments.map((appointment) => {
                const canCancel = ["pending", "confirmed"].includes(
                  appointment.status,
                );
                const purpose = purposeLabel(appointment.service_purpose);
                return (
                  <article
                    key={appointment.id}
                    className="rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-900">
                            {serviceLabel(appointment.service_type)}
                          </h4>
                          {purpose && (
                            <span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">
                              {purpose}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[appointment.status]}`}
                          >
                            {appointment.status}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays size={16} />
                            {formatAppointmentDate(
                              appointment.appointment_date,
                            )}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Clock size={16} />
                            {formatAppointmentTime(
                              appointment.appointment_time,
                            )}
                          </span>
                          <span className="font-bold text-pine-700">
                            {formatFee(appointment.fee)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedAppointment(appointment)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-pine-200 px-4 py-2.5 text-sm font-semibold text-pine-700 hover:bg-pine-50"
                        >
                          <Eye size={17} /> View Details
                        </button>
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancellationReason("");
                              setCancelTarget(appointment);
                            }}
                            disabled={cancellingId === appointment.id}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            <XCircle size={17} /> Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              <PaginationControls
                page={page}
                totalItems={filteredAppointments.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>

      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onCancel={
            ["pending", "confirmed"].includes(selectedAppointment.status)
              ? () => {
                  setCancellationReason("");
                  setCancelTarget(selectedAppointment);
                  setSelectedAppointment(null);
                }
              : undefined
          }
        />
      )}

      {cancelTarget && (
        <CancelAppointmentModal
          appointment={cancelTarget}
          reason={cancellationReason}
          saving={cancellingId === cancelTarget.id}
          onReasonChange={setCancellationReason}
          onClose={() => {
            if (cancellingId) return;
            setCancelTarget(null);
            setCancellationReason("");
          }}
          onConfirm={() => void cancelAppointment()}
        />
      )}
    </section>
  );
}

function AppointmentDetailsModal({
  appointment,
  onClose,
  onCancel,
}: {
  appointment: Appointment;
  onClose: () => void;
  onCancel?: () => void;
}) {
  const purpose = purposeLabel(appointment.service_purpose);
  const panelRef = useDialogFocus<HTMLDivElement>(true, onClose, null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="appointment-details-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-pine-700">
              Appointment details
            </p>
            <h3
              id="appointment-details-title"
              className="mt-1 text-xl font-bold text-slate-900"
            >
              {serviceLabel(appointment.service_type)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close appointment details"
            className="rounded-xl border border-slate-200 p-2 text-slate-500"
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
            <Detail
              label="Date"
              value={formatAppointmentDate(appointment.appointment_date)}
            />
            <Detail
              label="Time"
              value={formatAppointmentTime(appointment.appointment_time)}
            />
            <Detail label="Fee" value={formatFee(appointment.fee)} />
            <Detail label="Status" value={appointment.status} />
          </dl>
          <AppointmentPaymentPanel key={appointment.id} appointment={appointment} />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <MessageSquareText size={17} className="text-pine-700" />
              Request details
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
              <strong>Cancellation reason:</strong>
              <p className="mt-1 whitespace-pre-wrap">
                {appointment.cancellation_reason}
              </p>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
            >
              Close
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                Cancel Appointment
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CancelAppointmentModal({
  appointment,
  reason,
  saving,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  appointment: Appointment;
  reason: string;
  saving: boolean;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dismiss = () => {
    if (saving) return;
    if (
      reason.trim() &&
      !window.confirm("Discard the unsaved cancellation reason?")
    )
      return;
    onClose();
  };
  const panelRef = useDialogFocus<HTMLDivElement>(true, dismiss, null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="appointment-cancel-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
      className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="dialog-panel w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
              Cancel appointment
            </p>
            <h3
              id="appointment-cancel-title"
              className="mt-1 text-xl font-bold text-slate-900"
            >
              {serviceLabel(appointment.service_type)}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {formatAppointmentDate(appointment.appointment_date)} at{" "}
              {formatAppointmentTime(appointment.appointment_time)}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={saving}
            aria-label="Close cancellation form"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        <label className="mt-5 block text-sm font-bold text-slate-800">
          Reason for cancellation <span className="text-red-600">*</span>
          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            minLength={3}
            maxLength={500}
            rows={4}
            required
            autoFocus
            placeholder="Explain why you need to cancel this appointment."
            className={`mt-2 w-full rounded-xl border p-4 font-normal outline-none focus:ring-4 ${reason.length > 0 && reason.trim().length < 3 ? "border-red-500 bg-red-50 focus:ring-red-100" : "border-slate-300 focus:border-pine-600 focus:ring-pine-100"}`}
          />
        </label>
        <p className="mt-1 text-right text-xs text-slate-400">
          {reason.length}/500
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={dismiss}
            disabled={saving}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            Keep Appointment
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || reason.trim().length < 3}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="animate-spin" size={17} />}
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-bold capitalize text-slate-800">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Message({ tone, text }: { tone: "error" | "success"; text: string }) {
  const success = tone === "success";
  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm ${success ? "border-sage-200 bg-sage-50 text-sage-800" : "border-red-200 bg-red-50 text-red-700"}`}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 shrink-0" size={19} />
      ) : (
        <AlertCircle className="mt-0.5 shrink-0" size={19} />
      )}
      <span>{text}</span>
    </div>
  );
}
