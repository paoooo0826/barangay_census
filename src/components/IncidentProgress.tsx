import { INCIDENT_PROGRESS } from "../lib/incidents";
export default function IncidentProgress({ status }: { status: string }) {
  const current = INCIDENT_PROGRESS.findIndex(
    (stage) => stage.value === status,
  );
  return (
    <section
      aria-label="Incident progress"
      className="mt-4 rounded-xl border bg-slate-50 p-4"
    >
      <h4 className="font-bold">Report Progress</h4>
      {status === "rejected" ? (
        <p className="mt-2 text-sm text-red-700">
          The report was rejected. Read the barangay's reason below. You may
          send a follow-up to ask for clarification.
        </p>
      ) : (
        <>
          <ol className="mt-3 grid gap-2 sm:grid-cols-4">
            {INCIDENT_PROGRESS.map((stage, index) => (
              <li
                key={stage.value}
                aria-current={stage.value === status ? "step" : undefined}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${index === current ? "bg-pine-700 text-white" : index < current ? "bg-pine-100 text-pine-800" : "bg-white text-slate-500"}`}
              >
                {stage.label}
                {index === current ? " · Current" : ""}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-slate-600">
            {INCIDENT_PROGRESS[current]?.description ??
              "The barangay has not recorded a progress status yet."}
          </p>
        </>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Stages show recorded status, not a percentage or promised completion
        date.
      </p>
    </section>
  );
}
