import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarCheck2, CalendarClock, CheckCircle2, CircleCheckBig, Clock, Loader2, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Appointment, AppointmentStatus, StoredAppointmentService } from '../types/database';
import { RESIDENCY_PURPOSES, serviceLabel } from './ResidentAppointments';
import SortControls from './SortControls';
import { readAllRows } from '../lib/pagination';
import { compareValues, type SortDirection } from '../lib/sorting';

interface AdminAppointmentsProps { refreshKey: number; }
interface AppointmentResident { first_name: string; middle_name?: string | null; last_name: string; suffix?: string | null; tracking_number?: string | null; contact_number?: string | null; email_address?: string | null; }
interface AdminAppointment extends Appointment { residents?: AppointmentResident | AppointmentResident[] | null; }

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-blue-100 text-blue-800', completed: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-slate-100 text-slate-700', rejected: 'bg-red-100 text-red-800',
};
function localDateValue(date = new Date()) { const local = new Date(date); local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); return local.toISOString().slice(0, 10); }
function formatDate(value: string) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(date); }
function formatTime(value: string) { const [h, m] = value.slice(0, 5).split(':'); const hour = Number(h); return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`; }
function formatFee(value: number) { return Number(value) === 0 ? 'Free' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(Number(value)); }
function residentFrom(a: AdminAppointment) { return Array.isArray(a.residents) ? a.residents[0] ?? null : a.residents ?? null; }
function fullName(r: AppointmentResident | null) { return r ? [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(' ') : 'Resident record unavailable'; }
function purposeLabel(a: AdminAppointment) { if (!a.service_purpose) return null; return RESIDENCY_PURPOSES.find((p) => p.value === a.service_purpose)?.label ?? a.service_purpose.replaceAll('_', ' '); }

export default function AdminAppointments({ refreshKey }: AdminAppointmentsProps) {
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [sortField, setSortField] = useState('appointment_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await readAllRows<AdminAppointment>((from, to) => supabase.from('appointments').select(`*, residents (first_name, middle_name, last_name, suffix, tracking_number, contact_number, email_address)`).order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true }).order('id', { ascending: true }).range(from, to));
      setAppointments(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load appointments.'); setAppointments([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadAppointments(); }, [loadAppointments, refreshKey]);

  const today = localDateValue();
  const metrics = useMemo(() => ({ total: appointments.length, today: appointments.filter((a) => a.appointment_date === today && !['cancelled','rejected'].includes(a.status)).length, completedToday: appointments.filter((a) => a.status === 'completed' && a.completed_at && localDateValue(new Date(a.completed_at)) === today).length, pending: appointments.filter((a) => a.status === 'pending').length }), [appointments, today]);
  const filtered = useMemo(() => appointments.filter((a) => {
    const r = residentFrom(a); const q = searchQuery.trim().toLowerCase();
    const haystack = [fullName(r), r?.tracking_number, r?.contact_number, r?.email_address, serviceLabel(a.service_type as StoredAppointmentService), purposeLabel(a)].filter(Boolean).join(' ').toLowerCase();
    return (!q || haystack.includes(q)) && (statusFilter === 'all' || a.status === statusFilter) && (!dateFilter || a.appointment_date === dateFilter);
  }).sort((l, r) => {
    const value = (a: AdminAppointment) => { const resident = residentFrom(a); if (sortField === 'resident') return resident ? `${resident.last_name} ${resident.first_name}` : null; if (sortField === 'service') return serviceLabel(a.service_type as StoredAppointmentService); if (sortField === 'fee') return Number(a.fee); if (sortField === 'status') return a.status; if (sortField === 'completed_at') return a.completed_at; return `${a.appointment_date}T${a.appointment_time}`; };
    return compareValues(value(l), value(r), sortDirection) || compareValues(l.id, r.id);
  }), [appointments, searchQuery, statusFilter, dateFilter, sortField, sortDirection]);

  async function updateStatus(a: AdminAppointment, status: AppointmentStatus) {
    let adminNotes = a.admin_notes ?? null;
    if (status === 'rejected') { const reason = window.prompt('Enter the reason for rejecting this appointment:'); if (reason === null) return; if (reason.trim().length < 3) { setError('Enter a short reason before rejecting the appointment.'); return; } adminNotes = reason.trim(); }
    setUpdatingId(a.id); setError(null); setSuccess(null);
    const payload: Record<string, unknown> = { status, admin_notes: adminNotes }; if (status === 'completed') payload.completed_at = new Date().toISOString();
    const { error: updateError } = await supabase.from('appointments').update(payload).eq('id', a.id); setUpdatingId(null);
    if (updateError) { setError(updateError.message); return; }
    setSuccess(`Appointment marked as ${status}.`); await loadAppointments();
  }

  const cards = [
    { label: 'All Appointments', value: metrics.total, icon: CalendarClock, style: 'bg-indigo-100 text-indigo-700' },
    { label: "Today's Schedule", value: metrics.today, icon: CalendarCheck2, style: 'bg-blue-100 text-blue-700' },
    { label: 'Completed Today', value: metrics.completedToday, icon: CircleCheckBig, style: 'bg-emerald-100 text-emerald-700' },
    { label: 'Waiting for Confirmation', value: metrics.pending, icon: Clock, style: 'bg-amber-100 text-amber-700' },
  ];

  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-sm font-semibold text-blue-700">Barangay services</p><h2 className="mt-1 text-xl font-bold text-slate-900">Appointment Management</h2><p className="mt-1 text-sm text-slate-500">Confirm, complete, or reject resident requests.</p></div><button type="button" onClick={() => void loadAppointments()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={loading ? 'animate-spin' : ''} size={17}/> Refresh</button></div>
    <div className="grid gap-4 border-b border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">{cards.map((c) => { const Icon = c.icon; return <article key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-500">{c.label}</p><p className="mt-1 text-3xl font-bold text-slate-900">{c.value}</p></div><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.style}`}><Icon size={21}/></div></div></article>; })}</div>
    <div className="p-5 sm:p-6">
      {error && <div className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18}/>{error}</div>}{success && <div className="mb-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18}/>{success}</div>}
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_210px_190px]"><label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search resident or service" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-blue-500"/></label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | AppointmentStatus)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="rejected">Rejected</option></select><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"/></div>
      <SortControls id="appointments" field={sortField} direction={sortDirection} options={[{ value:'appointment_date', label:'Appointment date and time' },{ value:'resident', label:'Resident last name' },{ value:'service', label:'Service' },{ value:'fee', label:'Fee' },{ value:'status', label:'Status' },{ value:'completed_at', label:'Completion date' }]} onFieldChange={setSortField} onDirectionChange={setSortDirection}/>
      {loading ? <div className="flex justify-center gap-3 py-16 text-sm text-slate-500"><Loader2 className="animate-spin text-blue-700"/> Loading appointments…</div> : <div className="mt-5 space-y-3">{filtered.map((a) => { const resident = residentFrom(a); const busy = updatingId === a.id; const p = purposeLabel(a); return <article key={a.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{serviceLabel(a.service_type as StoredAppointmentService)}</h3>{p && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{p}</span>}<span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[a.status]}`}>{a.status}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{formatFee(a.fee)}</span></div><p className="mt-2 font-semibold text-slate-700">{fullName(resident)}</p><p className="mt-2 text-sm text-slate-500">{formatDate(a.appointment_date)} · {formatTime(a.appointment_time)}</p><p className="mt-2 text-sm text-slate-600">{a.purpose}</p>{a.admin_notes && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><strong>Admin note:</strong> {a.admin_notes}</p>}</div><div className="flex flex-wrap gap-2">{a.status === 'pending' && <button disabled={busy} onClick={() => void updateStatus(a,'confirmed')} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm</button>}{a.status === 'confirmed' && <button disabled={busy} onClick={() => void updateStatus(a,'completed')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Complete</button>}{['pending','confirmed'].includes(a.status) && <button disabled={busy} onClick={() => void updateStatus(a,'rejected')} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reject</button>}</div></div></article>; })}{!filtered.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">No matching appointments.</div>}</div>}
    </div>
  </section>;
}
