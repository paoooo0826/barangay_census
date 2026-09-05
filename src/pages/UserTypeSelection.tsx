import { Users, ShieldCheck } from "lucide-react";

interface UserTypeSelectionProps {
  onResident: () => void;import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  FileCheck2,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  Users,
} from "lucide-react";

interface UserTypeSelectionProps {
  onResident: () => void;
  onAdmin: () => void;
}

const services = [
  { icon: FileCheck2, label: "Census registration" },
  { icon: CalendarCheck2, label: "Online appointments" },
  { icon: Megaphone, label: "Barangay announcements" },
];

export default function UserTypeSelection({
  onResident,
  onAdmin,
}: UserTypeSelectionProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute -bottom-56 right-[-10rem] h-[38rem] w-[38rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.22),transparent_38%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-950/30">
              <Building2 size={23} />
            </div>
            <div>
              <p className="font-bold tracking-tight">Barangay Old Lucban</p>
              <p className="text-xs text-slate-400">Resident Information & Service Portal</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 sm:flex">
            <LockKeyhole size={14} />
            Secure online access
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:py-16">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-sm font-semibold text-blue-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Official Digital Service Portal
            </div>

            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-7xl">
              Barangay services,
              <span className="block bg-gradient-to-r from-blue-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
                made simpler.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Register your census record, book appointments, receive announcements,
              and track barangay services from one secure portal.
            </p>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {services.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200">
                    <Icon size={18} />
                  </div>
                  <span className="text-sm font-semibold text-slate-200">{label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/15 bg-white p-6 text-slate-900 shadow-2xl shadow-black/30 sm:p-8">
            <div className="mb-7">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Welcome</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Choose your portal</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Select how you want to access the Barangay Old Lucban system.
              </p>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={onResident}
                className="group flex w-full items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-100 hover:shadow-lg hover:shadow-blue-100"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-200">
                  <Users size={25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-slate-900">Resident Portal</p>
                  <p className="mt-0.5 text-sm text-slate-600">Register, sign in, and request services</p>
                </div>
                <ArrowRight className="text-blue-600 transition group-hover:translate-x-1" size={21} />
              </button>

              <button
                type="button"
                onClick={onAdmin}
                className="group flex w-full items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-100 hover:shadow-lg hover:shadow-emerald-100"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-200">
                  <ShieldCheck size={25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-slate-900">Administrator Portal</p>
                  <p className="mt-0.5 text-sm text-slate-600">Review records and manage services</p>
                </div>
                <ArrowRight className="text-emerald-600 transition group-hover:translate-x-1" size={21} />
              </button>
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-100 p-4 text-xs leading-5 text-slate-600">
              <LockKeyhole className="mt-0.5 shrink-0 text-slate-500" size={16} />
              Personal information is protected by account authentication and database access policies.
            </div>
          </section>
        </div>

        <footer className="border-t border-white/10 py-5 text-center text-xs text-slate-500 sm:text-left">
          Barangay Old Lucban · Baguio City · Resident Information Management System
        </footer>
      </div>
    </main>
  );
}

  onAdmin: () => void;
}

export default function UserTypeSelection({
  onResident,
  onAdmin,
}: UserTypeSelectionProps) {

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">

      <div className="bg-white shadow-xl rounded-xl p-10 w-full max-w-md">

        <h1 className="text-3xl font-bold text-center mb-3">
          Barangay Census System
        </h1>

        <p className="text-gray-500 text-center mb-8">
          Select your account type
        </p>


        <button
          onClick={onResident}
          className="w-full flex items-center gap-4 p-5 mb-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          <Users size={32}/>

          <div className="text-left">
            <h2 className="font-bold text-lg">
              Resident
            </h2>

            <p className="text-sm">
              Register or login as resident
            </p>
          </div>

        </button>



        <button
          onClick={onAdmin}
          className="w-full flex items-center gap-4 p-5 rounded-lg bg-green-600 text-white hover:bg-green-700"
        >

          <ShieldCheck size={32}/>

          <div className="text-left">
            <h2 className="font-bold text-lg">
              Administrator
            </h2>

            <p className="text-sm">
              Barangay admin access
            </p>
          </div>

        </button>


      </div>

    </div>
  );
}
