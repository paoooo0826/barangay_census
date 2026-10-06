import AuthLayout from "../components/AuthLayout";
import { useState } from "react";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface AdminAuthProps {
  onBack: () => void;
  onLoginSuccess: () => void;
}

export default function AdminAuth({ onBack, onLoginSuccess }: AdminAuthProps) {
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);

    try {
      const { error: signInError } = await signIn(normalizedEmail, password);

      if (signInError) {
        setError(
          "Invalid administrator email or password. Please contact the Barangay Office if you need access.",
        );
        return;
      }

      onLoginSuccess();
    } catch (caughtError) {
      console.error(caughtError);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout onBack={onBack} admin>
      <div className="mb-8 text-center lg:text-left">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-pine-100 lg:mx-0">
          <ShieldCheck className="h-8 w-8 text-pine-700" />
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine-600">
          Administrator Portal
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">Welcome back</h1>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          Sign in using your authorized administrator account to continue.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="admin-email"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Email address{" "}
            <span className="text-red-600" aria-hidden="true">
              *
            </span>
          </label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@barangay.gov.ph"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pine-500 focus:bg-white focus:ring-4 focus:ring-pine-100"
              required
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Password{" "}
            <span className="text-red-600" aria-hidden="true">
              *
            </span>
          </label>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pine-500 focus:bg-white focus:ring-4 focus:ring-pine-100"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="icon-button absolute right-1 top-1/2 -translate-y-1/2 text-slate-500"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3.5"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" />
              Sign in to dashboard
            </>
          )}
        </button>
      </form>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-xs leading-5 text-slate-500">
          Administrator accounts are created and managed by the Barangay Office.
          Unauthorized access is prohibited.
        </p>
      </div>
    </AuthLayout>
  );
}
