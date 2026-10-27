import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { supabase } from "../lib/supabase";
import { money, paymentTime } from "../lib/payments";
import type { Appointment, ServicePayment } from "../types/database";

export default function AppointmentPaymentPanel({
  appointment,
  admin = false,
  onChanged,
}: {
  appointment: Appointment;
  admin?: boolean;
  onChanged?: () => void;
}) {
  const [payments, setPayments] = useState<ServicePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [receipt, setReceipt] = useState("");
  const [amount, setAmount] = useState(String(appointment.fee));
  const [voidReason, setVoidReason] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const request = useRef(0);
  const writeLock = useRef(false);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  const posted = payments.find((payment) => payment.status === "posted");
  const free = Number(appointment.fee) === 0;
  const canCollect =
    admin &&
    !posted &&
    (appointment.status === "confirmed" ||
      appointment.legacy_receipt_missing === true);

  const load = useCallback(async () => {
    if (!mounted.current) return;
    const generation = ++request.current;
    setLoading(true);
    const { data, error: readError } = await supabase
      .from("service_payments")
      .select("*")
      .eq("appointment_id", appointment.id)
      .order("paid_at", { ascending: false })
      .order("id");
    if (generation !== request.current) return;
    setLoading(false);
    setReadFailed(Boolean(readError));
    if (readError) {
      setError(readError.message);
      setPayments([]);
    } else {
      setPayments((data ?? []) as ServicePayment[]);
      setError("");
    }
  }, [appointment.id]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      ++request.current;
    };
  }, [load]);

  const collect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (writeLock.current || !canCollect || loading || readFailed) return;
    const cleanReceipt = receipt.trim();
    const numeric = Number(amount);
    if (
      !cleanReceipt ||
      cleanReceipt.length > 80 ||
      !Number.isFinite(numeric) ||
      numeric !== Number(appointment.fee)
    ) {
      setError("Enter an official receipt number and the exact saved fee.");
      return;
    }
    const payload = `${appointment.id}:${numeric}:${cleanReceipt.toLowerCase()}`;
    if (retry.current?.payload !== payload)
      retry.current = { payload, key: crypto.randomUUID() };
    writeLock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const { data, error: writeError } = await supabase.rpc(
        "record_service_payment",
        {
          p_appointment_id: appointment.id,
          p_amount: numeric,
          p_receipt_number: cleanReceipt,
          p_expected_fee: Number(appointment.fee),
          p_request_key: retry.current.key,
        },
      );
      if (!mounted.current) return;
      if (writeError) throw writeError;
      if (!(data as unknown as ServicePayment)?.id)
        throw new Error("Collection was not confirmed.");
      setReceipt("");
      setSuccess("Receipt issued and appointment completed.");
      await load();
      onChanged?.();
    } catch (caught) {
      if (!mounted.current) return;
      setError(
        caught && typeof caught === "object" && "message" in caught
          ? String(caught.message)
          : "Collection could not be confirmed. Retry using the same receipt number.",
      );
    } finally {
      writeLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const voidPayment = async () => {
    if (writeLock.current || !admin || !posted) return;
    if (voidReason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters.");
      return;
    }
    writeLock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const { data, error: writeError } = await supabase.rpc(
        "void_service_payment",
        { p_payment_id: posted.id, p_reason: voidReason.trim() },
      );
      if (!mounted.current) return;
      if (writeError) throw writeError;
      if ((data as unknown as ServicePayment)?.status !== "voided")
        throw new Error("Correction was not confirmed.");
      setCorrecting(false);
      setVoidReason("");
      setSuccess(
        "Receipt voided and history preserved. The appointment is Accepted and awaits a corrected receipt.",
      );
      await load();
      onChanged?.();
    } catch (caught) {
      if (!mounted.current) return;
      setError(
        caught && typeof caught === "object" && "message" in caught
          ? String(caught.message)
          : "Unable to correct payment record.",
      );
    } finally {
      writeLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  async function completeExistingReceipt() {
    if (writeLock.current || !posted) return;
    writeLock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("transition_appointment", {
        p_appointment_id: appointment.id,
        p_expected_status: appointment.status,
        p_new_status: "completed",
        p_admin_notes: appointment.admin_notes ?? null,
      });
      if (r.error) throw r.error;
      if (!(r.data as { updated?: boolean })?.updated)
        throw new Error("The appointment changed. Reload before retrying.");
      if (mounted.current) {
        setSuccess("Existing receipt linked; completion confirmed.");
        onChanged?.();
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e && typeof e === "object" && "message" in e
            ? String(e.message)
            : "Unable to confirm completion.",
        );
    } finally {
      writeLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Payment and receipt"
      className="rounded-2xl border border-pine-200 bg-pine-50 p-4"
    >
      <h4 className="flex items-center gap-2 font-bold text-pine-900">
        <Receipt size={18} />
        Payment & receipt
      </h4>
      {loading ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading payment record…
        </p>
      ) : readFailed ? (
        <p className="mt-2 text-sm text-red-700">Payment status unavailable</p>
      ) : (
        <p className="mt-2 text-sm font-semibold text-pine-900">
          {free
            ? posted
              ? "Zero-Fee Release Acknowledged"
              : "Free — release acknowledgment pending"
            : posted
              ? `Paid · ${money(posted.amount)}`
              : ["cancelled", "rejected"].includes(appointment.status)
                ? "No payment recorded — request closed"
                : `Unpaid · ${money(appointment.fee)} due`}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-600">
        Completion requires a posted receipt matching the saved fee. Zero-fee
        services require a release acknowledgment.
      </p>
      {error && (
        <div role="alert" className="mt-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            disabled={busy}
            className="ml-2 underline"
            onClick={() => void load()}
          >
            Reload payment record
          </button>
        </div>
      )}
      {success && (
        <p role="status" className="mt-3 text-sm text-sage-800">
          {success}
        </p>
      )}
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm"
        >
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Receipt number</dt>
              <dd className="break-words font-bold">
                {payment.receipt_number}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Collection</dt>
              <dd>
                {money(payment.amount)} ·{" "}
                {payment.status === "posted"
                  ? payment.method === "zero_fee_acknowledgment"
                    ? "Release Acknowledged"
                    : "Paid"
                  : "Voided"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Collected by</dt>
              <dd className="break-words">{payment.cashier_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Date (Manila)</dt>
              <dd>{paymentTime(payment.paid_at)}</dd>
            </div>
          </dl>
          {payment.status === "voided" && (
            <p className="mt-2 break-words text-amber-900">
              Voided {paymentTime(payment.voided_at!)}: {payment.void_reason}
            </p>
          )}
        </div>
      ))}
      {canCollect && !loading && !readFailed && (
        <form
          onSubmit={(event) => void collect(event)}
          className="mt-4 space-y-3"
        >
          <p className="text-xs text-slate-600">
            {free
              ? "Record the service release acknowledgment. No cash payment is created."
              : "Record cash already collected at the barangay office using the issued official receipt. Saving this receipt completes the appointment."}
          </p>
          <label className="block text-sm font-semibold">
            {free ? "Service Fee" : "Amount Collected"}{" "}
            <span className="text-red-600">*</span>
            <input
              aria-label="Amount collected"
              type="number"
              min={free ? "0" : "0.01"}
              step="0.01"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
              disabled={busy || free}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3"
            />
          </label>
          <label className="block text-sm font-semibold">
            {free
              ? "Release Acknowledgment Reference"
              : "Official Receipt Number"}{" "}
            <span className="text-red-600">*</span>
            <input
              aria-label="Official receipt number"
              required
              maxLength={80}
              value={receipt}
              onChange={(e) => {
                setReceipt(e.target.value);
                setError("");
              }}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3"
            />
          </label>
          <button
            type="submit"
            disabled={busy || Boolean(error)}
            className="w-full rounded-lg bg-pine-800 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? "Recording…"
              : free
                ? "Issue Acknowledgment and Complete"
                : "Record Receipt and Complete"}
          </button>
        </form>
      )}
      {admin &&
        posted &&
        !appointment.has_valid_receipt &&
        (appointment.status === "confirmed" ||
          appointment.legacy_receipt_missing) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void completeExistingReceipt()}
            className="mt-4 rounded-xl bg-pine-700 p-3 font-bold text-white"
          >
            Complete Using Existing Receipt
          </button>
        )}
      {admin && appointment.status === "pending" && (
        <p className="mt-3 text-sm text-slate-600">
          Accept this appointment before issuing a receipt or release
          acknowledgment.
        </p>
      )}
      {admin && posted && !loading && !readFailed && (
        <div className="mt-4">
          {!correcting ? (
            <button
              type="button"
              className="text-sm font-semibold text-red-700 underline"
              onClick={() => setCorrecting(true)}
            >
              Correct / void this payment record
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Voiding preserves this receipt and reopens its completed
                appointment as Accepted, awaiting a corrected receipt. Any cash
                refund must be handled separately.
              </p>
              <label className="block text-sm font-semibold">
                Reason <span className="text-red-600">*</span>
                <textarea
                  aria-label="Reason for voiding payment"
                  minLength={3}
                  maxLength={1000}
                  value={voidReason}
                  disabled={busy}
                  onChange={(e) => {
                    setVoidReason(e.target.value);
                    setError("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void voidPayment()}
                  className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Void record
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCorrecting(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  Keep record
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
