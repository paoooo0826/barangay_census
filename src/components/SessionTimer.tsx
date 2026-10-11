import { Clock3 } from "lucide-react";

export default function SessionTimer({ seconds }: { seconds: number }) {
  const minutes = Math.floor(seconds / 60);
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div
      role="timer"
      aria-label="Time until inactivity sign-out"
      aria-live="off"
      title="Time until automatic sign-out. Activity resets this timer; use Stay Signed In during the final-minute warning."
      className={`pointer-events-auto flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm ${seconds <= 60 ? "border-amber-300 text-amber-900" : "border-slate-300 text-pine-800"}`}
    >
      <Clock3 size={16} aria-hidden="true" className="shrink-0" />
      <span className="text-xs font-semibold">Session</span>
      <span className="font-bold tabular-nums">{clock}</span>
    </div>
  );
}
