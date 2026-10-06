import {
  ArrowRight,
  CalendarDays,
  FileCheck2,
  Megaphone,
  ShieldCheck,
  Users,
} from "lucide-react";
import BarangayBrand from "../components/BarangayBrand";
import PineLandscape from "../components/PineLandscape";

interface UserTypeSelectionProps {
  onResident: () => void;
  onAdmin: () => void;
}

const services = [
  {
    icon: FileCheck2,
    label: "Census records",
    detail: "Register and keep your information current.",
  },
  {
    icon: CalendarDays,
    label: "Appointments",
    detail: "Request services and track your appointments.",
  },
  {
    icon: Megaphone,
    label: "Community updates",
    detail: "Stay informed about barangay announcements.",
  },
];

export default function UserTypeSelection({
  onResident,
  onAdmin,
}: UserTypeSelectionProps) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 py-6">
          <BarangayBrand />
          <p className="hidden text-xs font-semibold tracking-wide text-slate-500 sm:block">
            Old Lucban · Baguio City
          </p>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-16">
          <section className="relative order-last lg:order-first">
            <p className="page-eyebrow">A service portal for our community</p>
            <h1 className="mt-5 max-w-2xl font-display text-4xl font-normal leading-[1.1] text-pine-900 sm:text-5xl lg:text-6xl">
              A connected barangay.
              <br />
              <span className="text-pine-600">A simpler everyday.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600">
              Your census record, appointments, and community updates—together
              in one place.
            </p>
            <div className="mt-7 flex items-center gap-3 text-sm text-slate-500">
              <span className="h-px w-8 bg-earth-300" />
              Made for the residents of Barangay Old Lucban
            </div>
            <PineLandscape className="mt-3 hidden w-full max-w-xl text-pine-700 sm:block" />
          </section>

          <section
            aria-labelledby="portal-heading"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8"
          >
            <p className="page-eyebrow">Welcome</p>
            <h2
              id="portal-heading"
              className="mt-3 text-3xl font-normal text-pine-900"
            >
              Choose your portal
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Continue as a resident or an authorized administrator.
            </p>
            <div className="mt-7 space-y-3">
              <button
                type="button"
                onClick={onResident}
                className="group flex min-h-28 w-full items-center gap-4 rounded-xl border border-pine-200 bg-pine-50 p-5 text-left transition hover:border-pine-400 hover:bg-pine-100"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-pine-800 text-white">
                  <Users size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-pine-900">
                    Resident Portal
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">
                    Sign in, register, and request services
                  </span>
                </span>
                <ArrowRight
                  className="shrink-0 text-pine-600 transition group-hover:translate-x-1"
                  size={19}
                />
              </button>
              <button
                type="button"
                onClick={onAdmin}
                className="group flex min-h-28 w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-pine-300 hover:bg-slate-50"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-pine-700">
                  <ShieldCheck size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-pine-900">
                    Administrator Portal
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">
                    Manage records and barangay services
                  </span>
                </span>
                <ArrowRight
                  className="shrink-0 text-slate-500 transition group-hover:translate-x-1"
                  size={19}
                />
              </button>
            </div>
            <p className="mt-6 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
              Use your own account to access your personal records.
              Administrator access is reserved for authorized barangay
              personnel.
            </p>
          </section>
        </div>

        <section
          aria-label="Portal services"
          className="grid gap-5 border-t border-slate-200 py-7 sm:grid-cols-3"
        >
          {services.map(({ icon: Icon, label, detail }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pine-100 text-pine-700">
                <Icon size={19} />
              </span>
              <div>
                <p className="text-sm font-bold text-pine-900">{label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {detail}
                </p>
              </div>
            </div>
          ))}
        </section>
        <footer className="border-t border-slate-200 py-5 text-xs text-slate-500">
          Barangay Old Lucban · Baguio City · Resident Information Management
          System
        </footer>
      </div>
    </main>
  );
}
