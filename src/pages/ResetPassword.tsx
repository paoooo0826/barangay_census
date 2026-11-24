import { useId, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

interface ResetPasswordProps {
  canResetPassword: boolean;
  onComplete: () => void;
}

export default function ResetPassword({
  onComplete,
  canResetPassword,
}: ResetPasswordProps) {
  const { signOut } = useAuth();
  const saving = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canResetPassword || saving.current) return;
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("Your new password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    saving.current = true;
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      setSuccess(
        "Your password was changed successfully. You can now sign in.",
      );
      setPassword("");
      setConfirmPassword("");
      const { error: logoutError } = await signOut();
      if (logoutError)
        setError(
          "Your password was changed, but the current session could not be signed out.",
        );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not finish resetting your password. Please try again.",
      );
    } finally {
      saving.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-pine-50 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-pine-100 text-pine-700">
            <KeyRound size={30} />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            Create a new password
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Choose a secure password for your resident account.
          </p>
        </div>

        {error && (
          <div className="mt-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 flex gap-2 rounded-xl border border-sage-200 bg-sage-50 p-3 text-sm text-sage-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {!canResetPassword && !success ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            This password-reset link is invalid or has expired. Return to the
            resident login and request a new link.
          </div>
        ) : !success ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <PasswordInput
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <PasswordInput
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pine-600 px-5 py-3 font-semibold text-white transition hover:bg-pine-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
              {loading ? "Saving password..." : "Save new password"}
            </button>
          </form>
        ) : null}

        <button
          type="button"
          onClick={onComplete}
          className="mt-5 w-full text-center text-sm font-semibold text-pine-600 transition hover:text-pine-800"
        >
          Return to resident login
        </button>
      </div>
    </div>
  );
}

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: PasswordInputProps) {
  const inputId = useId();
  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={8}
          autoComplete={autoComplete}
          className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 outline-none transition focus:border-pine-500 focus:ring-4 focus:ring-pine-100"
          required
        />
      </div>
    </div>
  );
}
