import type { ReactNode } from "react";
import { ArrowLeft, FileCheck2, CalendarDays, ShieldCheck } from "lucide-react";
import BarangayBrand from "./BarangayBrand";
import PineLandscape from "./PineLandscape";

export default function AuthLayout({
  children,
  onBack,
  admin = false,
}: {
  children: ReactNode;
  onBack: () => void;
  admin?: boolean;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <BarangayBrand subtitle="Baguio City · Barangay Services" />
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-pine-50 hover:text-pine-800"
        >
          <ArrowLeft size={17} /> Back to portals
        </button>
      </header>
      <div className="mx-auto grid max-w-6xl items-center gap-10 py-8 lg:min-h-[calc(100vh-110px)] lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:py-14">
        <section className="hidden lg:block">
          <p className="page-eyebrow">
            {admin ? "Administrator access" : "For our community"}
          </p>
          <h2 className="mt-5 font-display text-5xl font-normal leading-[1.12] text-pine-900 xl:text-6xl">
            {admin ? (
              <>
                Good records.
                <br />
                Better service.
              </>
            ) : (
              <>
                Your barangay.
                <br />
                Closer to you.
              </>
            )}
          </h2>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-600">
            {admin
              ? "Keep resident records organized, manage appointments, and share updates with the community."
              : "Keep your census information up to date, book barangay services, and stay informed—all in one place."}
          </p>
          <div className="mt-8 space-y-4 border-l-2 border-earth-200 pl-5 text-sm text-slate-600">
            <p className="flex items-center gap-3">
              <FileCheck2 size={18} className="text-pine-600" /> Census records
              and verification
            </p>
            <p className="flex items-center gap-3">
              <CalendarDays size={18} className="text-pine-600" /> Appointments
              and barangay services
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-pine-600" /> Secure account
              access
            </p>
          </div>
          <PineLandscape className="mt-8 w-full max-w-lg text-pine-700" />
        </section>
        <section className="auth-surface mx-auto w-full max-w-lg">
          {children}
        </section>
      </div>
      <footer className="mx-auto max-w-6xl border-t border-slate-200 py-4 text-xs text-slate-500">
        Barangay Old Lucban · Baguio City
      </footer>
    </main>
  );
}
