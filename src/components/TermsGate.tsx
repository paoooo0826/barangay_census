import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { acceptAccountTerms, readAccountTerms, type AccountTerms } from "../lib/accountTerms";
import { useDialogFocus } from "../hooks/useDialogFocus";

export default function TermsGate({ userId, onLeave, children }: { userId: string; onLeave: () => void; children: ReactNode }) {
  const [terms, setTerms] = useState<AccountTerms | null>(null);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const active = useRef(true);
  const request = useRef(0);
  const confirmed = useRef(false);
  const saveLock = useRef(false);
  const needsConsent = Boolean(terms?.document && !terms.acceptance);
  // This required dialog can only be left by accepting or logging out.
  const dialog = useDialogFocus<HTMLDivElement>(needsConsent, () => {}, null);
  const documentId = terms?.document?.id;
  useEffect(() => setAgreed(false), [documentId]);
  const read = useCallback(async () => {
    if (confirmed.current) return;
    const generation = ++request.current;
    setChecking(true);
    try {
      const result = await readAccountTerms(userId);
      if (!active.current || generation !== request.current || confirmed.current) return;
      confirmed.current = Boolean(result.acceptance);
      setTerms(result);
      setError("");
    } catch (caught) {
      if (active.current && generation === request.current && !confirmed.current) setError(caught instanceof Error ? caught.message : "Unable to check your acceptance. Retry.");
    } finally {
      if (active.current && generation === request.current) setChecking(false);
    }
  }, [userId]);
  useEffect(() => {
    active.current = true;
    void read();
    const refresh = () => { if (!document.hidden) void read(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active.current = false;
      ++request.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [read]);
  async function confirm() {
    if (!agreed || !terms?.document || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const acceptance = await acceptAccountTerms(terms.document.id, userId);
      if (!active.current) return;
      confirmed.current = true;
      ++request.current;
      setTerms({ ...terms, acceptance });
    } catch (caught) {
      if (active.current) setError(caught instanceof Error ? caught.message : "Unable to save acceptance. Please retry.");
    } finally {
      saveLock.current = false;
      if (active.current) setSaving(false);
    }
  }
  if (terms?.acceptance) return <>{children}</>;
  if (needsConsent && terms?.document) return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6">
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="terms-title" aria-describedby="terms-instruction" className="flex max-h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-slate-100 p-5 sm:p-7">
          <ShieldCheck className="mb-3 text-pine-700" size={30} />
          <h1 id="terms-title" className="text-xl font-bold text-slate-900">{terms.document.title}</h1>
          <p id="terms-instruction" className="mt-2 text-sm text-slate-600">Read the notice and explicitly agree before continuing to your account.</p>
        </div>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-7" tabIndex={0} aria-label="Approved Terms and Conditions">
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{terms.document.content}</p>
          <p className="mt-4 text-xs text-slate-500">Notice Version: {terms.document.version}</p>
        </div>
        <div className="shrink-0 border-t border-slate-100 p-5 sm:p-7">
          <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={agreed} disabled={saving} onChange={event => setAgreed(event.target.checked)} className="mt-0.5" />
            I agree to the Terms and Conditions
          </label>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" className="btn-secondary" disabled={saving} onClick={onLeave}>Log Out</button>
            <button type="button" className="btn-primary" disabled={!agreed || saving} onClick={() => void confirm()}>{saving ? "Saving Acceptance…" : "Confirm and Continue"}</button>
          </div>
        </div>
      </section>
    </div>
  );
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {checking && !error ? <><Loader2 className="mx-auto animate-spin text-pine-700" size={30} /><p role="status" className="mt-4 text-sm">Checking Terms and Conditions…</p></> : <>
          <h1 className="text-xl font-bold">Terms and Conditions</h1>
          <p role="alert" className="mt-3 text-sm text-slate-700">{error || "Approved terms content is needed before you can proceed. Please contact the barangay office."}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3"><button type="button" disabled={checking} className="btn-secondary" onClick={() => void read()}>Retry</button><button type="button" className="btn-primary" onClick={onLeave}>Log Out</button></div>
        </>}
      </section>
    </div>
  );
}
