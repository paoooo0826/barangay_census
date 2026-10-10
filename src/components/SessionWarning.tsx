import { useDialogFocus } from "../hooks/useDialogFocus";
export default function SessionWarning({
  seconds,
  onStay,
  onLogout,
}: {
  seconds: number;
  onStay: () => void;
  onLogout: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(true, () => {}, null);
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        className="w-full max-w-md rounded-2xl bg-white p-6"
      >
        <h2 id="session-warning-title" className="text-xl font-bold">
          Your session is about to expire
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          You have been inactive. You will be signed out in{" "}
          <strong>{seconds} seconds</strong>.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={onStay}>
            Stay Signed In
          </button>
          <button type="button" className="btn-secondary" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
