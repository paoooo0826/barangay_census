import AuthLayout from "../components/AuthLayout";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Loader2,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { residentConfirmationRedirect } from "../lib/residentAuthCallback";

interface ResidentAuthProps {
  onBack: () => void;
  confirmationNotice?: string;
}

type AuthField = "email" | "password" | "confirmPassword";
type AuthFailure = { code?: string; message?: string; status?: number };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_RETRY_KEY = "barangay:resident-email-retry-at";
const CONFIRMATION_SENT =
  "If this account still needs verification, check your inbox and spam folder for the latest link. If you already confirmed your email, sign in instead.";

function readEmailRetryAt() {
  try {
    const value = Number(sessionStorage.getItem(EMAIL_RETRY_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

const isRateLimited = (error: AuthFailure) =>
  error.status === 429 ||
  /^(over_email_send_rate_limit|over_request_rate_limit)$/.test(
    error.code ?? "",
  ) ||
  /rate limit|too many|only request this after/i.test(error.message ?? "");

export default function ResidentAuth({
  onBack,
  confirmationNotice,
}: ResidentAuthProps) {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(confirmationNotice ?? "");
  const [success, setSuccess] = useState("");
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailRetryAt, setEmailRetryAt] = useState(readEmailRetryAt);
  const [now, setNow] = useState(Date.now);
  const resendCooldown = Math.max(0, Math.ceil((emailRetryAt - now) / 1000));
  const inFlight = useRef(false);
  const busy = loading || resendingEmail;
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<AuthField, string>>
  >({});

  const clearFieldError = (field: AuthField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const inputClass = (field: AuthField, withIcon = false) =>
    `w-full rounded-xl border bg-white py-3 px-4 outline-none transition ${
      withIcon ? "pl-10" : ""
    } ${
      fieldErrors[field]
        ? "border-red-500 bg-red-50 focus:border-red-500 focus:ring-4 focus:ring-red-100"
        : "border-slate-300 focus:border-pine-500 focus:ring-4 focus:ring-pine-100"
    }`;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown, now]);

  function startEmailCooldown(seconds = 60) {
    const started = Date.now();
    const until = started + seconds * 1000;
    setNow(started);
    setEmailRetryAt(until);
    try {
      sessionStorage.setItem(EMAIL_RETRY_KEY, String(until));
    } catch {
      // Supabase's own email limits remain in force.
    }
  }

  function handleEmailError(failure: AuthFailure) {
    if (isRateLimited(failure)) {
      const retry = Number(failure.message?.match(/(\d+)\s+seconds?/i)?.[1]);
      startEmailCooldown(Number.isFinite(retry) ? Math.max(60, retry) : 60);
      setError(
        "The email service is limiting requests. Wait before trying again. If you already received a link, use the latest one.",
      );
    } else {
      setError(
        failure.message ||
          "Could not complete the email request. Please try again.",
      );
    }
  }

  const handleResendConfirmation = async () => {
    if (inFlight.current || emailRetryAt > Date.now()) return;
    const normalizedEmail = email.trim().toLowerCase();
    setSuccess("");
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFieldErrors({ email: "Enter the email you used to register." });
      setError(
        "Enter your registration email above to request another confirmation link.",
      );
      return;
    }
    setFieldErrors({});
    setError("");
    inFlight.current = true;
    setResendingEmail(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo: residentConfirmationRedirect() },
      });
      if (resendError) throw resendError;
      setSuccess(CONFIRMATION_SENT);
      startEmailCooldown();
    } catch (caught) {
      handleEmailError((caught ?? {}) as AuthFailure);
    } finally {
      inFlight.current = false;
      setResendingEmail(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || emailRetryAt > Date.now()) return;
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setFieldErrors({ email: "Email address is required." });
      setError("Enter the email address connected to your resident account.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFieldErrors({ email: "Enter a valid email address." });
      setError("Enter a valid email address.");
      return;
    }

    setFieldErrors({});

    inFlight.current = true;
    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}?password-reset=1`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo },
      );

      if (resetError) throw resetError;

      setSuccess(
        "If an account uses that email, a password-reset link has been sent. Check your inbox and spam folder.",
      );
      startEmailCooldown();
    } catch (caughtError) {
      handleEmailError((caughtError ?? {}) as AuthFailure);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || (!isLogin && emailRetryAt > Date.now())) return;
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();

    const missingFields: Partial<Record<AuthField, string>> = {};
    if (!normalizedEmail) missingFields.email = "Email address is required.";
    if (!password) missingFields.password = "Password is required.";
    if (!isLogin && !confirmPassword) {
      missingFields.confirmPassword = "Please confirm your password.";
    }

    if (Object.keys(missingFields).length > 0) {
      setFieldErrors(missingFields);
      setError("Please complete the required fields highlighted below.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFieldErrors({ email: "Enter a valid email address." });
      setError("Enter a valid email address.");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      setError("Passwords do not match");
      return;
    }

    if (!isLogin && password.length < 6) {
      setFieldErrors({ password: "Use at least 6 characters." });
      setError("Password must be at least 6 characters");
      return;
    }

    setFieldErrors({});

    inFlight.current = true;
    setLoading(true);

    try {
      if (isLogin) {
        const { error: authError } = await signIn(normalizedEmail, password);
        if (
          authError?.code === "email_not_confirmed" ||
          /email not confirmed/i.test(authError?.message ?? "")
        ) {
          setError(
            "Confirm your email before signing in. Use the latest link, or choose Resend verification email below.",
          );
        } else if (
          authError?.code === "invalid_credentials" ||
          /invalid login credentials/i.test(authError?.message ?? "")
        ) {
          setError(
            "Could not sign in with that email and password. Check both, or choose Forgot password.",
          );
        } else if (authError) {
          setError(authError.message);
        }
        // App resumes registration or opens the dashboard once Auth sets a session.
        return;
      }

      const result = await signUp(normalizedEmail, password);
      if (
        result.error &&
        result.error.code !== "user_already_exists" &&
        !/already registered|already exists/i.test(result.error.message)
      ) {
        handleEmailError(result.error);
        return;
      }
      if (
        result.needsEmailConfirmation ||
        result.isExistingUser ||
        result.error
      ) {
        setSuccess(CONFIRMATION_SENT);
        startEmailCooldown();
        setIsLogin(true);
        setPassword("");
        setConfirmPassword("");
      }
    } catch (caughtError) {
      handleEmailError((caughtError ?? {}) as AuthFailure);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout onBack={onBack}>
      <div className="text-center mb-8">
        <div
          className="
              inline-flex
              items-center
              justify-center
              w-16
              h-16
              rounded-2xl
              bg-pine-100
              mb-4
            "
        >
          <User className="text-pine-600" size={32} />
        </div>

        <h1
          className="
              text-2xl
              font-bold
              text-slate-900
            "
        >
          {isForgotPassword
            ? "Reset Password"
            : isLogin
              ? "Resident Login"
              : "Create Account"}
        </h1>

        <p className="text-slate-500 mt-2">
          {isForgotPassword
            ? "Enter your account email and we'll send you a secure reset link"
            : isLogin
              ? "Sign in to track your census application"
              : "Create an account to start registration"}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="
              bg-red-100
              text-red-700
              p-3
              rounded-lg
              mb-5
              text-sm
            "
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="
              bg-sage-100
              text-sage-700
              p-3
              rounded-lg
              mb-5
              text-sm
            "
        >
          {success}
        </div>
      )}

      <form
        onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div>
          <label
            htmlFor="resident-email"
            className="block mb-2 text-sm font-semibold text-slate-700"
          >
            Email Address{" "}
            <span className="text-red-600" aria-hidden="true">
              *
            </span>
          </label>

          <div className="relative">
            <Mail
              className="
                  absolute
                  left-3
                  top-3
                  text-slate-400
                  "
              size={20}
            />

            <input
              id="resident-email"
              disabled={busy}
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("email");
              }}
              placeholder="your@email.com"
              className={inputClass("email", true)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={
                fieldErrors.email ? "resident-email-error" : undefined
              }
            />
          </div>

          {fieldErrors.email && (
            <p
              id="resident-email-error"
              className="mt-1.5 text-xs font-semibold text-red-600"
            >
              {fieldErrors.email}
            </p>
          )}
        </div>

        {!isForgotPassword && (
          <div>
            <label
              htmlFor="resident-password"
              className="block mb-2 text-sm font-semibold text-slate-700"
            >
              Password{" "}
              <span className="text-red-600" aria-hidden="true">
                *
              </span>
            </label>

            <div className="relative">
              <Lock
                className="
                  absolute
                  left-3
                  top-3
                  text-slate-400
                  "
                size={20}
              />

              <input
                id="resident-password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFieldError("password");
                }}
                placeholder="Password"
                className={`${inputClass("password", true)} pr-12`}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={
                  fieldErrors.password ? "resident-password-error" : undefined
                }
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

            {fieldErrors.password && (
              <p
                id="resident-password-error"
                className="mt-1.5 text-xs font-semibold text-red-600"
              >
                {fieldErrors.password}
              </p>
            )}
          </div>
        )}

        {!isForgotPassword && !isLogin && (
          <div>
            <label
              htmlFor="resident-confirm-password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Confirm Password{" "}
              <span className="text-red-600" aria-hidden="true">
                *
              </span>
            </label>
            <div className="relative">
              <input
                id="resident-confirm-password"
                autoComplete="new-password"
                required
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  clearFieldError("confirmPassword");
                }}
                placeholder="Confirm Password"
                className={`${inputClass("confirmPassword")} pr-12`}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={
                  fieldErrors.confirmPassword
                    ? "resident-confirm-password-error"
                    : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="icon-button absolute right-1 top-1/2 -translate-y-1/2 text-slate-500"
                aria-label={
                  showConfirmPassword
                    ? "Hide confirmed password"
                    : "Show confirmed password"
                }
              >
                {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p
                id="resident-confirm-password-error"
                className="mt-1.5 text-xs font-semibold text-red-600"
              >
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>
        )}

        <button
          disabled={
            busy || ((!isLogin || isForgotPassword) && resendCooldown > 0)
          }
          type="submit"
          className="btn-primary w-full py-3"
        >
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : isForgotPassword ? (
            "Send Reset Link"
          ) : isLogin ? (
            "Sign In"
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      {isLogin && !isForgotPassword && (
        <button
          type="button"
          disabled={busy || resendCooldown > 0}
          onClick={() => void handleResendConfirmation()}
          className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-semibold text-pine-600 hover:text-pine-800 disabled:opacity-60"
        >
          {resendingEmail ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {resendingEmail
            ? "Requesting verification email…"
            : "Resend verification email"}
        </button>
      )}
      {resendCooldown > 0 && (
        <p className="mt-2 text-center text-xs text-slate-600">
          Wait {resendCooldown}s before requesting another email.
        </p>
      )}

      {isLogin && !isForgotPassword && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setIsForgotPassword(true);
            setError("");
            setSuccess("");
            setPassword("");
            setFieldErrors({});
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-semibold text-pine-600 transition hover:text-pine-800"
        >
          <KeyRound size={16} />
          Forgot password?
        </button>
      )}

      {isForgotPassword && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setIsForgotPassword(false);
            setError("");
            setSuccess("");
            setFieldErrors({});
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-pine-700"
        >
          <ArrowLeft size={16} />
          Back to resident login
        </button>
      )}

      {!isForgotPassword && (
        <div className="mt-6 text-center">
          <p className="text-slate-500">
            {isLogin ? "Don't have an account?" : "Already have an account?"}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setIsLogin(!isLogin);
                setIsForgotPassword(false);
                setError("");
                setSuccess("");
                setFieldErrors({});
              }}
              className="
                ml-2
                text-pine-600
                font-semibold
                "
            >
              {isLogin ? "Register" : "Login"}
            </button>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
