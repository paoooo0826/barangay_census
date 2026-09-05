import { useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Mail,
  Lock,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AdminAuthProps {
  onBack: () => void;
  onLoginSuccess: () => void;
}

export default function AdminAuth({
  onBack,
  onLoginSuccess,
}: AdminAuthProps) {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const { error: signInError } = await signIn(
        normalizedEmail,
        password,
      );

      if (signInError) {
        setError(
          'Invalid administrator email or password. Please contact the Barangay Office if you need access.',
        );
        return;
      }

      onLoginSuccess();
    } catch (caughtError) {
      console.error(caughtError);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-blue-900/10 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to user selection
              </button>
            </div>

            <div className="max-w-md">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                <ShieldCheck className="h-8 w-8" />
              </div>

              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-100">
                Barangay Census System
              </p>

              <h1 className="text-4xl font-bold leading-tight">
                Secure administrator access
              </h1>

              <p className="mt-5 text-base leading-7 text-blue-100">
                Review resident submissions, verify census records, manage remarks,
                and monitor barangay census activity from one dashboard.
              </p>
            </div>

            <p className="text-sm text-blue-100/80">
              Authorized Barangay Office personnel only
            </p>
          </section>

          <section className="p-6 sm:p-10 lg:p-12">
            <button
              type="button"
              onClick={onBack}
              className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-blue-700 lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="mx-auto max-w-md">
              <div className="mb-8 text-center lg:text-left">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 lg:mx-0">
                  <ShieldCheck className="h-8 w-8 text-blue-700" />
                </div>

                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                  Administrator Portal
                </p>

                <h2 className="mt-2 text-3xl font-bold text-slate-900">
                  Welcome back
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Sign in using your authorized administrator account to continue.
                </p>
              </div>

              {error && (
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
                    Email address
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
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-password"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
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
                  Administrator accounts are created and managed by the Barangay
                  Office. Unauthorized access is prohibited.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
