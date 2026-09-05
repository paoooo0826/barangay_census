import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Home,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type {
  Appointment,
  AppointmentService,
  AppointmentStatus,
  Resident,
} from '../types/database';

export type ResidentAppointmentView = 'services' | 'appointments' | 'book';

interface ResidentAppointmentsProps {
  resident: Resident | null;
  view: ResidentAppointmentView;
  initialService?: AppointmentService | null;
  onBook: (service?: AppointmentService) => void;
  onBooked: () => void;
}

interface ServiceDefinition {
  value: AppointmentService;
  label: string;
  description: string;
  fee: number;
  icon: typeof FileText;
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
    fee: 100,
    icon: FileCheck2,
    iconClass: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'certificate_of_indigency',
    label: 'Certificate of Indigency',
    description: 'Request proof of low-income status for government or financial assistance.',
    fee: 0,
    icon: FileText,
    iconClass: 'bg-emerald-100 text-emerald-700',
  },
  {
    value: 'certificate_of_residency',
    label: 'Certificate of Residency',
    description: 'Request proof that you are a legitimate resident of Barangay Old Lucban.',
    fee: 50,
    icon: Home,
    iconClass: 'bg-amber-100 text-amber-700',
  },
  {
    value: 'complaint',
    label: 'Complaints',
    description: 'Schedule a confidential visit to file or discuss a barangay complaint.',
    fee: 0,
    icon: MessageSquareWarning,
    iconClass: 'bg-rose-100 text-rose-700',
  },
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

function serviceDefinition(value: AppointmentService) {
  return APPOINTMENT_SERVICES.find((service) => service.value === value)
    ?? APPOINTMENT_SERVICES[0];
}

export default function ResidentAppointments({
  resident,
  view,
  initialService,
  onBook,
  onBooked,
}: ResidentAppointmentsProps) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedService, setSelectedService] = useState<AppointmentService>(
    initialService ?? 'barangay_clearance',
  );
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialService) setSelectedService(initialService);
  }, [initialService]);

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

    if (appointmentError) {
      setError(appointmentError.message);
    } else {
      setAppointments((data ?? []) as Appointment[]);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (view === 'appointments') void loadAppointments();
  }, [loadAppointments, view]);

  const upcomingCount = useMemo(
    () => appointments.filter((appointment) =>
      ['pending', 'confirmed'].includes(appointment.status),
    ).length,
    [appointments],
  );

  const submitAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user || !resident) {
      setError('Complete your census record before booking an appointment.');
      return;
    }

    if (!appointmentDate || !appointmentTime || purpose.trim().length < 5) {
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
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      purpose: purpose.trim(),
      status: 'pending',
    });

    setSaving(false);

    if (insertError) {
      if (insertError.code === '23505') {
        setError('You already have an active booking for this service, date, and time.');
      } else {
        setError(insertError.message);
      }
      return;
    }

    setSuccess('Appointment submitted successfully. Wait for administrator confirmation.');
    setAppointmentDate('');
    setAppointmentTime('');
    setPurpose('');
    window.setTimeout(onBooked, 900);
  };

  const cancelAppointment = async (appointmentId: string) => {
    if (!window.confirm('Cancel this appointment?')) return;

    setCancellingId(appointmentId);
    setError(null);

    const { data, error: cancellationError } = await supabase.rpc(
      'cancel_resident_appointment',
      { appointment_id: appointmentId },
    );

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

  if (view === 'services') {
    return (
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Online barangay services
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Available Services</h2>
              <p className="mt-1 text-sm text-slate-500">
                Select a service to schedule your visit to the barangay office.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onBook()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
            >
              <CalendarPlus size={18} />
              Book Appointment
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8 xl:grid-cols-4">
          {APPOINTMENT_SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <button
                type="button"
                key={service.value}
                onClick={() => onBook(service.value)}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${service.iconClass}`}>
                  <Icon size={23} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900 group-hover:text-blue-700">
                  {service.label}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">
                  {service.description}
                </p>
                <span className="mt-5 inline-flex w-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                  {formatFee(service.fee)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  if (view === 'appointments') {
    return (
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Appointment history</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">My Appointments</h2>
            <p className="mt-1 text-sm text-slate-500">
              {upcomingCount} pending or confirmed appointment{upcomingCount === 1 ? '' : 's'}.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadAppointments()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} size={17} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => onBook()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
            >
              <CalendarPlus size={17} /> Book New
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {error && <Message tone="error" text={error} />}
          {success && <Message tone="success" text={success} />}

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
              <Loader2 className="animate-spin text-blue-700" /> Loading appointments...
            </div>
          ) : appointments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
              <CalendarDays className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-800">No appointments yet</h3>
              <p className="mt-2 text-sm text-slate-500">Choose an available service to schedule your first visit.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((appointment) => {
                const service = serviceDefinition(appointment.service_type);
                const Icon = service.icon;
                const canCancel = ['pending', 'confirmed'].includes(appointment.status);
                return (
                  <article key={appointment.id} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-4">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${service.iconClass}`}>
                          <Icon size={22} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-900">{service.label}</h3>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[appointment.status]}`}>
                              {appointment.status.replaceAll('_', ' ')}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-2"><CalendarDays size={16} />{formatAppointmentDate(appointment.appointment_date)}</span>
                            <span className="inline-flex items-center gap-2"><Clock size={16} />{formatAppointmentTime(appointment.appointment_time)}</span>
                            <span className="font-bold text-blue-700">{formatFee(appointment.fee)}</span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">{appointment.purpose}</p>
                          {appointment.admin_notes && (
                            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                              <strong>Administrator note:</strong> {appointment.admin_notes}
                            </p>
                          )}
                        </div>
                      </div>
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => void cancelAppointment(appointment.id)}
                          disabled={cancellingId === appointment.id}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {cancellingId === appointment.id ? <Loader2 className="animate-spin" size={17} /> : <XCircle size={17} />}
                          Cancel
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    );
  }

  const selected = serviceDefinition(selectedService);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-6 py-8 text-white sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Barangay service portal</p>
        <h2 className="mt-2 text-3xl font-bold">Book an Appointment</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
          Choose a service and reserve a weekday schedule. Document fees are paid at the barangay office.
        </p>
      </div>

      <form onSubmit={submitAppointment} className="space-y-7 p-6 sm:p-8">
        {error && <Message tone="error" text={error} />}
        {success && <Message tone="success" text={success} />}

        {!resident && (
          <Message tone="error" text="Complete your census record before booking an appointment." />
        )}

        <fieldset>
          <legend className="text-sm font-bold text-slate-800">Select a service</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {APPOINTMENT_SERVICES.map((service) => {
              const Icon = service.icon;
              const selectedOption = selectedService === service.value;
              return (
                <button
                  type="button"
                  key={service.value}
                  onClick={() => setSelectedService(service.value)}
                  className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                    selectedOption
                      ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${service.iconClass}`}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{service.label}</p>
                    <p className="mt-1 text-sm font-semibold text-blue-700">{formatFee(service.fee)}</p>
                  </div>
                  {selectedOption && <CheckCircle2 className="text-blue-700" size={20} />}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-slate-700">
          <strong>{selected.label}:</strong> {selected.description}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-800">
            Appointment date <span className="text-red-600">*</span>
            <input
              type="date"
              value={appointmentDate}
              min={todayInputValue()}
              onChange={(event) => setAppointmentDate(event.target.value)}
              required
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block text-sm font-bold text-slate-800">
            Appointment time <span className="text-red-600">*</span>
            <select
              value={appointmentTime}
              onChange={(event) => setAppointmentTime(event.target.value)}
              required
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Select a time</option>
              {TIME_SLOTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-sm font-bold text-slate-800">
          {selectedService === 'complaint' ? 'Complaint details' : 'Purpose of request'} <span className="text-red-600">*</span>
          <textarea
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            minLength={5}
            maxLength={1000}
            required
            rows={5}
            placeholder={selectedService === 'complaint'
              ? 'Briefly explain the complaint you need to discuss.'
              : 'Explain why you need this document.'}
            className="mt-2 w-full rounded-xl border border-slate-300 p-4 font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          />
          <span className="mt-1 block text-right text-xs font-normal text-slate-400">{purpose.length}/1000</span>
        </label>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">Service fee</p>
            <p className="text-2xl font-bold text-blue-800">{formatFee(selected.fee)}</p>
          </div>
          <button
            type="submit"
            disabled={saving || !resident}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={19} /> : <CalendarPlus size={19} />}
            {saving ? 'Submitting...' : 'Submit Appointment'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Message({ tone, text }: { tone: 'error' | 'success'; text: string }) {
  const success = tone === 'success';
  return (
    <div className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm ${
      success
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-red-200 bg-red-50 text-red-700'
    }`}>
      {success
        ? <CheckCircle2 className="mt-0.5 shrink-0" size={19} />
        : <AlertCircle className="mt-0.5 shrink-0" size={19} />}
      <span>{text}</span>
    </div>
  );
}
