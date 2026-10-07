import { useEffect, useRef, useState, type ComponentType } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { FaceVerificationProps } from "./FaceIdentityVerification";

export default function FaceVerificationLoader(props: FaceVerificationProps) {
  const [requested, setRequested] = useState(false);
  const [Component, setComponent] =
    useState<ComponentType<FaceVerificationProps> | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const shouldLoad = Boolean(
    props.idFrontFile && (requested || props.autoStart),
  );
  useEffect(() => {
    if (!shouldLoad || Component) return;
    const current = ++generation.current;
    void import("./FaceIdentityVerification")
      .then((module) => {
        if (generation.current === current) {
          setComponent(() => module.default);
          setError("");
        }
      })
      .catch(() => {
        if (generation.current === current)
          setError(
            "Face verification could not load. Check your connection and retry.",
          );
      });
    return () => {
      ++generation.current;
    };
  }, [shouldLoad, Component, retry]);
  if (Component) return <Component {...props} autoStart={shouldLoad} />;
  return (
    <div className="rounded-2xl border border-pine-200 bg-pine-50 p-5">
      <h3 className="flex items-center gap-2 font-bold text-pine-900">
        <ShieldCheck size={20} />
        Live face verification
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        Add your ID images to start camera verification.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {shouldLoad && !error ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 text-sm text-pine-800"
        >
          <Loader2 size={18} className="animate-spin" />
          Loading camera verification…
        </p>
      ) : (
        <button
          type="button"
          disabled={!props.idFrontFile || props.disabled}
          className="mt-4 rounded-xl bg-pine-800 px-4 py-3 font-semibold text-white disabled:opacity-50"
          onClick={() => {
            setRequested(true);
            setError("");
            setRetry((n) => n + 1);
          }}
        >
          {error ? "Retry loading" : "Start live verification"}
        </button>
      )}
    </div>
  );
}
