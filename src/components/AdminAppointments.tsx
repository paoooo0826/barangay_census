import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CircleCheckBig,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import type {
  Appointment,
  AppointmentService,
  AppointmentStatus,
} from '../types/database';
import { APPOINTMENT_SERVICES } from './ResidentAppointments';

interface AdminAppointmentsProps {
  refreshKey: number;
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

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-100 text-slate-700',
  rejected: 'bg-red-100 text-red-800',
};

function localDateValue(date = new Date()) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatTime(value: string) {
  const [hourText, minuteText] = value.slice(0, 5).split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteText} ${suffix}`;
}

function formatFee(value: number) {
  if (Number(value) === 0) return 'Free';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(Number(value));
}

function serviceLabel(serviceType: AppointmentService) {
  return APPOINTMENT_SERVICES.find((service) => service.value === serviceType)?.label
    ?? serviceType.replaceAll('_', ' ');
}

function residentFrom(appointment: AdminAppointment) {
  if (Array.isArray(appointment.residents)) return appointment.residents[0] ?? null;
  return appointment.residents ?? null;
}

function fullName(resident: AppointmentResident | null) {
  if (!resident) return 'Resident record unavailable';
  return [resident.first_name, resident.middle_name, resident.last_name, resident.suffix]
    .filter(Boolean)
    .join(' ');
}

export default function AdminAppointments({ refreshKey }: AdminAppointmentsProps) {
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: appointmentError } = await supabase
      .from('appointments')
      .select(`
        *,
        residents (
          first_name,
          middle_name,
          last_name,
          suffix,
          tracking_number,
          contact_number,
          email_address
        )
      `)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });

    if (appointmentError) {
      setError(appointmentError.message);
      setAppointments([]);
    } else {
      setAppointments((data ?? []) as AdminAppointment[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments, refreshKey]);

  const today = localDateValue();

  const metrics = useMemo(() => ({
    total: appointments.length,
    today: appointments.filter((appointment) =>
      appointment.appointment_date === today
      && !['cancelled', 'rejected'].includes(appointment.status),
    ).length,
    completedToday: appointments.filter((appointment) =>
      appointment.status === 'completed'
      && appointment.completed_at
      && localDateValue(new Date(appointment.completed_at)) === today,
    ).length,
    pending: appointments.filter((appointment) => appointment.status === 'pending').length,
  }), [appointments, today]);

  const filteredAppointments = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();

    return appointments.filter((appointment) => {
      const resident = residentFrom(appointment);
      const searchable = [
        fullName(resident),
        resident?.tracking_number,
        resident?.contact_number,
        resident?.email_address,
        serviceLabel(appointment.service_type),
      ].filter(Boolean).join(' ').toLowerCase();

      return (!search || searchable.includes(search))
        && (statusFilter === 'all' || appointment.status === statusFilter)
        && (!dateFilter || appointment.appointment_date === dateFilter);
    });
  }, [appointments, dateFilter, searchQuery, statusFilter]);

  const updateStatus = async (
    appointment: AdminAppointment,
    nextStatus: AppointmentStatus,
  ) => {
    let adminNotes = appointment.admin_notes ?? null;

    if (nextStatus === 'rejected') {
      const reason = window.prompt('Enter the reason for rejecting this appointment:');
      if (reason === null) return;
      if (reason.trim().length < 3) {
        setError('Enter a short reason before rejecting the appointment.');
        return;
      }
      adminNotes = reason.trim();
    }

    setUpdatingId(appointment.id);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: nextStatus, admin_notes: adminNotes })
      .eq('id', appointment.id);

    setUpdatingId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(`Appointment marked as ${nextStatus}.`);
    await loadAppointments();
  };

  const metricCards = [
    { label: 'All Appointments', value: metrics.total, icon: CalendarClock, style: 'bg-indigo-100 text-indigo-700' },
    { label: "Today's Schedule", value: metrics.today, icon: CalendarCheck2, style: 'bg-blue-100 text-blue-700' },
    { label: 'Completed Today', value: metrics.completedToday, icon: CircleCheckBig, style: 'bg-emerald-100 text-emerald-700' },
    { label: 'Waiting for Confirmation', value: metrics.pending, icon: Clock, style: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-700">Barangay services</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Appointment Management</h2>
            <p className="mt-1 text-sm text-slate-500">
              Confirm bookings, complete daily appointments, and review resident requests.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAppointments()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={17} /> Refresh Appointments
          </button>
        </div>
      </div>

      <div className="grid gap-4 border-b border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-900">{card.value}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.style}`}>
                  <Icon size={21} />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="p-5 sm:p-6">
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 shrink-0" size={18} /> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> {success}
          </div>
        )}

        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_210px_190px]">
          <label className="relative">
            <span className="sr-only">Search appointments</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search resident, tracking number, or service"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | AppointmentStatus)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            aria-label="Filter appointment date"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="animate-spin text-blue-700" /> Loading appointments...
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
            <CalendarClock className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 font-bold text-slate-800">No matching appointments</h3>
            <p className="mt-1 text-sm text-slate-500">New resident bookings will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAppointments.map((appointment) => {
              const resident = residentFrom(appointment);
              const busy = updatingId === appointment.id;

              return (
                <article key={appointment.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-sm sm:p-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{serviceLabel(appointment.service_type)}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[appointment.status]}`}>
                          {appointment.status}
                        </span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                          {formatFee(appointment.fee)}
                        </span>
                      </div>
                      <p className="mt-2 font-semibold text-slate-700">{fullName(resident)}</p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                        <span>{formatDate(appointment.appointment_date)}</span>
                        <span>{formatTime(appointment.appointment_time)}</span>
                        {resident?.tracking_number && <span>{resident.tracking_number}</span>}
                        {resident?.contact_number && <span>{resident.contact_number}</span>}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{appointment.purpose}</p>
                      {appointment.admin_notes && (
                        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                          <strong>Admin note:</strong> {appointment.admin_notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 xl:max-w-[310px] xl:justify-end">
                      {appointment.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => void updateStatus(appointment, 'confirmed')}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Confirm
                        </button>
                      )}
                      {['pending', 'confirmed'].includes(appointment.status) && (
                        <button
                          type="button"
                          onClick={() => void updateStatus(appointment, 'completed')}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                        >
                          <CircleCheckBig size={16} /> Complete
                        </button>
                      )}
                      {['pending', 'confirmed'].includes(appointment.status) && (
                        <button
                          type="button"
                          onClick={() => void updateStatus(appointment, 'rejected')}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          <XCircle size={16} /> Reject
                        </button>
                      )}
                    </div>
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
