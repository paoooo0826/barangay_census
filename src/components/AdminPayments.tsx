import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  collectionRange,
  manilaDate,
  money,
  paymentTime,
} from "../lib/payments";
import { searchPattern, usePagedQuery } from "../hooks/usePagedQuery";
import PaginationControls from "./PaginationControls";
import { AdminAppointmentDetails } from "./AdminAppointments";
import type {
  ServicePayment,
  StoredAppointmentService,
  Appointment,
} from "../types/database";
import { serviceLabel } from "./ResidentAppointments";

interface PaymentRecord extends ServicePayment {
  resident_name: string;
  service_type: StoredAppointmentService;
  appointment_status: string;
}
interface Collections {
  collected: number;
  paid_requests: number;
  voided_records: number;
  free_requests: number;
}
export default function AdminPayments() {
  const [date, setDate] = useState(manilaDate());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Collections | null>(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Appointment | null>(null);
  const request = useRef(0);
  const detailRequest = useRef(0);
  const close = useCallback(() => {
    ++detailRequest.current;
    setDetail(null);
  }, []);
  const query = useCallback(
    (from: number, to: number) => {
      const range = collectionRange(date);
      let q = supabase
        .from("admin_payment_records")
        .select("*", { count: "exact" })
        .gte("paid_at", range.start)
        .lt("paid_at", range.end);
      if (status !== "all") q = q.eq("status", status);
      if (search.trim()) q = q.ilike("search_text", searchPattern(search));
      return q
        .order("paid_at", { ascending: false })
        .order("id")
        .range(from, to);
    },
    [date, search, status],
  );
  const {
    rows,
    total,
    loading,
    error: listError,
    reload,
  } = usePagedQuery<PaymentRecord>({
    page,
    pageSize: 10,
    onPageChange: setPage,
    query,
  });
  const loadSummary = useCallback(async () => {
    const generation = ++request.current;
    const { data, error: readError } = await supabase.rpc(
      "admin_daily_collections",
      { p_date: date },
    );
    if (generation !== request.current) return;
    setSummary(readError ? null : (data as unknown as Collections));
    setError(readError?.message ?? "");
  }, [date]);
  useEffect(() => {
    void loadSummary();
    const timer = window.setInterval(() => void loadSummary(), 60_000);
    return () => {
      ++request.current;
      window.clearInterval(timer);
    };
  }, [loadSummary]);
  const view = async (id: string) => {
    const generation = ++detailRequest.current;
    const { data, error: e } = await supabase
      .from("admin_service_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (generation !== detailRequest.current) return;
    if (e || !data) setError(e?.message ?? "Service request is unavailable.");
    else setDetail(data as Appointment);
  };
  useEffect(
    () => () => {
      ++detailRequest.current;
    },
    [],
  );
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Payments & Receipts</h2>
        <p className="mt-1 text-sm text-slate-600">
          Daily cash collection report. Dates use Philippine time. Record
          collections from a service’s details.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-semibold">
          Collection date
          <input
            aria-label="Collection date"
            type="date"
            required
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setPage(1);
              }
            }}
            className="mt-1 block rounded-lg border border-slate-300 p-3"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void reload();
            void loadSummary();
          }}
          className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold"
        >
          Refresh report
        </button>
      </div>
      {(error || listError) && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error || listError}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Cash collected", summary ? money(summary.collected) : "—"],
          ["Paid requests", summary?.paid_requests ?? "—"],
          ["Voided records", summary?.voided_records ?? "—"],
          ["Free requests received", summary?.free_requests ?? "—"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-pine-900">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Cash totals exclude voided records. The report changes when a collection
        is corrected; all original receipt records remain available.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="Search receipts"
            placeholder="Search resident, receipt or cashier"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 p-3"
          />
          <select
            aria-label="Payment status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 p-3"
          >
            <option value="all">All receipt records</option>
            <option value="posted">Paid</option>
            <option value="voided">Voided</option>
          </select>
        </div>
        {loading ? (
          <p role="status">Loading receipts…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-slate-500">
            No payment records for this date and filter.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((payment) => (
              <article
                key={payment.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-bold">
                    {payment.resident_name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {serviceLabel(payment.service_type)}
                  </p>
                  <p className="mt-1 break-words text-sm">
                    Receipt: {payment.receipt_number} · {money(payment.amount)}{" "}
                    · {payment.status === "posted" ? "Paid" : "Voided"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {paymentTime(payment.paid_at)} · {payment.cashier_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void view(payment.appointment_id)}
                  className="rounded-lg border border-pine-300 px-4 py-2 text-sm font-semibold text-pine-800"
                >
                  View service
                </button>
              </article>
            ))}
          </div>
        )}
        <PaginationControls
          page={page}
          pageSize={10}
          totalItems={total}
          onPageChange={setPage}
        />
      </div>
      {detail && (
        <AdminAppointmentDetails
          appointment={detail}
          onClose={close}
          onPaymentChanged={() => {
            void reload();
            void loadSummary();
          }}
        />
      )}
    </section>
  );
}
