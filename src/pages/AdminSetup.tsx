import { ShieldCheck } from "lucide-react";
import AuthLayout from "../components/AuthLayout";

interface AdminSetupProps {
  onNavigate: (path: string) => void;
}

export default function AdminSetup({ onNavigate }: AdminSetupProps) {
  return (
    <AuthLayout admin onBack={() => onNavigate("/")}>
      <div className="text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-pine-700" />
        <h1 className="mt-5 text-2xl font-bold text-pine-900">
          Administrator access
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Administrator accounts are managed by authorized barangay personnel.
          Sign in using your assigned administrator account. Contact the
          barangay administrator if you need access.
        </p>
        <button
          type="button"
          className="btn-primary mt-6 w-full"
          onClick={() => onNavigate("/admin")}
        >
          Go to administrator login
        </button>
      </div>
    </AuthLayout>
  );
}
