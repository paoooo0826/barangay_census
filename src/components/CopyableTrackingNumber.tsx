import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Older browsers and restricted clipboard permissions can use the selection fallback.
  }
  const focused = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : [];
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(field);
  try {
    field.select();
    if (!document.execCommand?.("copy"))
      throw new Error("Clipboard unavailable");
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
    selection?.removeAllRanges();
    ranges.forEach((range) => selection?.addRange(range));
  }
}

export default function CopyableTrackingNumber({
  trackingNumber,
}: {
  trackingNumber?: string | null;
}) {
  const [feedback, setFeedback] = useState<"" | "copied" | "error">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  if (!trackingNumber) return <span>Not provided</span>;
  return (
    <span className="inline-flex min-w-0 max-w-full flex-col items-start">
      <button
        type="button"
        aria-label={`Copy tracking number ${trackingNumber}`}
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-1 text-left font-semibold text-pine-700 underline-offset-4 hover:bg-pine-50 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine-600"
        onClick={async (event) => {
          event.stopPropagation();
          if (busy.current) return;
          busy.current = true;
          try {
            await copyText(trackingNumber);
            if (mounted.current) setFeedback("copied");
          } catch {
            if (mounted.current) setFeedback("error");
          } finally {
            busy.current = false;
            if (mounted.current) {
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => setFeedback(""), 4000);
            }
          }
        }}
      >
        <span className="min-w-0 break-all normal-case">{trackingNumber}</span>
        {feedback === "copied" ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={`max-w-full text-xs font-medium ${feedback === "error" ? "text-red-700" : "text-sage-800"}`}
      >
        {feedback === "copied"
          ? "Tracking number copied!"
          : feedback === "error"
            ? "Could not copy. Select the tracking number and copy it manually."
            : ""}
      </span>
    </span>
  );
}
