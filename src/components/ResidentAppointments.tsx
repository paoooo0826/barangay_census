import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FileCheck2,
  Home,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type {
  Appointment,
  AppointmentPurpose,
  AppointmentService,
  AppointmentStatus,
  Resident,
  StoredAppointmentService,
} from '../types/database';

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

export const APPOINTMENT_SERVICES: ServiceDefinition[] = [
  {
    value: 'barangay_clearance',
    label: 'Barangay Clearance',
    description: 'Request a clearance for employment, business, or other legal purposes.',
    feeLabel: '₱130 student / ₱230 non-student',
    icon: FileCheck2,
    iconClass: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'certificate_of_residency',
    label: 'Certificate of Residency',
    description: 'Request a residency certificate for a supported barangay purpose.',
    feeLabel: '₱30 · First Low Income request is free',
    icon: Home,
    iconClass: 'bg-amber-100 text-amber-700',
  },
];

export const RESIDENCY_PURPOSES: Array<{ value: AppointmentPurpose; label: string }> = [
  { value: 'low_income', label: 'Low Income' },
  { value: 'good_moral', label: 'Good Moral Certificate' },
  { value: 'financial', label: 'Financial' },
  { value: 'medical_assistance', label: 'Medical Assistance Certificate' },
];

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-100 text-slate-700',
  rejected: 'bg-red-100 text-red-800',
};

const TIME_SLOTS = [
  ['08:00', '8:00 AM'],
  ['08:30', '8:30 AM'],
  ['09:00', '9:00 AM'],
  ['09:30', '9:30 AM'],
  ['10:00', '10:00 AM'],
  ['10:30', '10:30 AM'],
  ['11:00', '11:00 AM'],
  ['11:30', '11:30 AM'],
  ['13:00', '1:00 PM'],
  ['13:30', '1:30 PM'],
  ['14:00', '2:00 PM'],
  ['14:30', '2:30 PM'],
  ['15:00', '3:00 PM'],
  ['15:30', '3:30 PM'],
  ['16:00', '4:00 PM'],
] as const;

function todayInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function formatAppointmentDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatAppointmentTime(value: string) {
  const normalized = value.slice(0, 5);
  return TIME_SLOTS.find(([time]) => time === normalized)?.[1] ?? normalized;
}

function formatFee(fee: number) {
  if (Number(fee) === 0) return 'Free';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(Number(fee));
}

export function serviceLabel(value: StoredAppointmentService) {
  const current = APPOINTMENT_SERVICES.find((service) => service.value === value)?.label;
  if (current) return current;
  if (value === 'certificate_of_indigency') return 'Certificate of Indigency (Legacy)';
  if (value === 'complaint') return 'Complaints (Legacy)';
  return value.replaceAll('_', ' ');
}

function purposeLabel(value?: AppointmentPurpose | null) {
  if (!value) return null;
  return RESIDENCY_PURPOSES.find((purpose) => purpose.value === value)?.label ?? value.replaceAll('_', ' ');
}

export default function ResidentAppointments({ resident, initialService }: ResidentAppointmentsProps) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showBooking, setShowBooking] = useState(Boolean(initialService));
  const [selectedService, setSelectedService] = useState<AppointmentService>(initialService ?? 'barangay_clearance');
  const [selectedPurpose, setSelectedPurpose] = useState<AppointmentPurpose>('low_income');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [details, setDetails] = useState('');
  const [feePreview, setFeePreview] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    if (!user) {
      setAppointments([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: appointmentError } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', user.id)
      .order('appointment_date', { ascending: false })
      .order('appointment_time', { ascending: false });
    if (appointmentError) setError(appointmentError.message);
    else setAppointments((data ?? []) as Appointment[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    if (!resident || !showBooking) {
      setFeePreview(null);
      return;
    }
    let cancelled = false;
    const loadFee = async () => {
      setFeeLoading(true);
      const { data, error: feeError } = await supabase.rpc('preview_appointment_fee', {
        p_resident_id: resident.id,
        p_service_type: selectedService,
        p_service_purpose: selectedService === 'certificate_of_residency' ? selectedPurpose : null,
      });
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

  const upcomingCount = useMemo(
    () => appointments.filter((appointment) => ['pending', 'confirmed'].includes(appointment.status)).length,
    [appointments],
  );
  const upcoming = appointments.filter((appointment) => ['pending', 'confirmed'].includes(appointment.status));
  const previous = appointments.filter((appointment) => !['pending', 'confirmed'].includes(appointment.status));

  const resetForm = () => {
    setAppointmentDate('');
    setAppointmentTime('');
    setDetails('');
    setSelectedPurpose('low_income');
  };

  const submitAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!user || !resident) {
      setError('Complete your census record before booking an appointment.');
      return;
    }
    if (!appointmentDate || !appointmentTime || details.trim().length < 5) {
      setError('Select a date and time, then provide at least five characters of details.');
      return;
    }
    const chosenDate = new Date(`${appointmentDate}T12:00:00`);
    if (chosenDate.getDay() === 0 || chosenDate.getDay() === 6) {
      setError('Appointments are available from Monday to Friday only.');
      return;
    }
    if (appointmentDate < todayInputValue()) {
      setError('Choose today or a future appointment date.');
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from('appointments').insert({
      resident_id: resident.id,
      user_id: user.id,
      service_type: selectedService,
      service_purpose: selectedService === 'certificate_of_residency' ? selectedPurpose : null,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      purpose: details.trim(),
      status: 'pending',
    });
    setSaving(false);

    if (insertError) {
      if (insertError.code === '23505') setError('You already have an active booking for this service, date, and time.');
      else setError(insertError.message);
      return;
    }

    setSuccess('Appointment submitted successfully. The final fee was calculated securely by the barangay system.');
    resetForm();
    setShowBooking(false);
    await loadAppointments();
  };

  const cancelAppointment = async (appointmentId: string) => {
    if (!window.confirm('Cancel this appointment?')) return;
    setCancellingId(appointmentId);
    setError(null);
    const { data, error: cancellationError } = await supabase.rpc('cancel_resident_appointment', { appointment_id: appointmentId });
    setCancellingId(null);
    if (cancellationError) {
      setError(cancellationError.message);
      return;
    }
    const result = data as CancellationResult | null;
    if (!result?.cancelled) {
      setError(result?.message ?? 'The appointment could not be cancelled.');
      return;
    }
    setSuccess(result.message ?? 'Appointment cancelled successfully.');
    await loadAppointments();
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Barangay services</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Appointments</h2>
          <p className="mt-1 text-sm text-slate-500">View existing requests, previous visits, or book a new appointment here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadAppointments()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={loading ? 'animate-spin' : ''} size={17} /> Refresh
          </button>
          <button type="button" onClick={() => setShowBooking((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">
            {showBooking ? <X size={17} /> : <CalendarPlus size={17} />}
            {showBooking ? 'Close Booking' : 'Book New'}
          </button>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {error && <Message tone="error" text={error} />}
        {success && <Message tone="success" text={success} />}

        {showBooking && (
          <form onSubmit={submitAppointment} className="mb-8 rounded-3xl border border-blue-100 bg-blue-50/40 p-5 sm:p-6">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-slate-900">Book an appointment</h3>
              <p className="mt-1 text-sm text-slate-500">The displayed fee is verified again by Supabase when you submit.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {APPOINTMENT_SERVICES.map((service) => {
                const Icon = service.icon;
                const active = selectedService === service.value;
                return (
                  <button key={service.value} type="button" onClick={() => setSelectedService(service.value)} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-blue-600 bg-white ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${service.iconClass}`}><Icon size={20} /></div>
                      <div>
                        <p className="font-bold text-slate-900">{service.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{service.description}</p>
                        <p className="mt-2 text-sm font-bold text-blue-700">{service.feeLabel}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedService === 'certificate_of_residency' && (
              <label className="mt-5 block text-sm font-bold text-slate-800">
                Certificate purpose <span className="text-red-600">*</span>
                <select value={selectedPurpose} onChange={(event) => setSelectedPurpose(event.target.value as AppointmentPurpose)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                  {RESIDENCY_PURPOSES.map((purpose) => <option key={purpose.value} value={purpose.value}>{purpose.label}</option>)}
                </select>
              </label>
            )}

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-800">Appointment date <span className="text-red-600">*</span>
                <input type="date" value={appointmentDate} min={todayInputValue()} onChange={(event) => setAppointmentDate(event.target.value)} required className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block text-sm font-bold text-slate-800">Appointment time <span className="text-red-600">*</span>
                <select value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)} required className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                  <option value="">Select a time</option>
                  {TIME_SLOTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            <label className="mt-5 block text-sm font-bold text-slate-800">Request details <span className="text-red-600">*</span>
              <textarea value={details} onChange={(event) => setDetails(event.target.value)} minLength={5} maxLength={1000} rows={4} required placeholder="Briefly explain why you need the document." className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-4 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
            </label>

            <div className="mt-6 flex flex-col gap-4 border-t border-blue-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">Fee before confirmation</p>
                <p className="mt-1 text-2xl font-bold text-blue-800">{feeLoading ? 'Checking…' : feePreview == null ? 'Unavailable' : formatFee(feePreview)}</p>
                {selectedService === 'certificate_of_residency' && selectedPurpose === 'low_income' && feePreview === 0 && (
                  <p className="mt-1 text-xs font-semibold text-emerald-700">First Low Income request benefit applied.</p>
                )}
              </div>
              <button type="submit" disabled={saving || feeLoading || feePreview == null || !resident} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={19} /> : <CalendarPlus size={19} />}
                {saving ? 'Submitting…' : 'Confirm Appointment'}
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="All requests" value={appointments.length} />
          <Metric label="Pending / confirmed" value={upcomingCount} />
          <Metric label="Completed / previous" value={previous.length} />
        </div>

        <AppointmentGroup title="Upcoming and active" appointments={upcoming} loading={loading} cancellingId={cancellingId} onCancel={cancelAppointment} />
        <AppointmentGroup title="Completed and previous" appointments={previous} loading={loading} cancellingId={cancellingId} onCancel={cancelAppointment} />
      </div>
    </section>
  );
}

function AppointmentGroup({ title, appointments, loading, cancellingId, onCancel }: { title: string; appointments: Appointment[]; loading: boolean; cancellingId: string | null; onCancel: (id: string) => Promise<void> }) {
  return (
    <div className="mt-7">
      <div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-blue-700" /><h3 className="font-bold text-slate-900">{title}</h3></div>
      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 py-10 text-sm text-slate-500"><Loader2 className="animate-spin text-blue-700" /> Loading appointments…</div>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">No appointments in this section.</div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => {
            const canCancel = ['pending', 'confirmed'].includes(appointment.status);
            const purpose = purposeLabel(appointment.service_purpose);
            return (
              <article key={appointment.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-900">{serviceLabel(appointment.service_type)}</h4>
                      {purpose && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{purpose}</span>}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[appointment.status]}`}>{appointment.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-2"><CalendarDays size={16} />{formatAppointmentDate(appointment.appointment_date)}</span>
                      <span className="inline-flex items-center gap-2"><Clock size={16} />{formatAppointmentTime(appointment.appointment_time)}</span>
                      <span className="font-bold text-blue-700">{formatFee(appointment.fee)}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{appointment.purpose}</p>
                    {appointment.admin_notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><strong>Administrator note:</strong> {appointment.admin_notes}</p>}
                  </div>
                  {canCancel && (
                    <button type="button" onClick={() => void onCancel(appointment.id)} disabled={cancellingId === appointment.id} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                      {cancellingId === appointment.id ? <Loader2 className="animate-spin" size={17} /> : <XCircle size={17} />} Cancel
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>;
}

function Message({ tone, text }: { tone: 'error' | 'success'; text: string }) {
  const success = tone === 'success';
  return (
    <div className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm ${success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
      {success ? <CheckCircle2 className="mt-0.5 shrink-0" size={19} /> : <AlertCircle className="mt-0.5 shrink-0" size={19} />}
      <span>{text}</span>
    </div>
  );
}
