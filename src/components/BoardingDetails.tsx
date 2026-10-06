import type { Resident } from "../types/database";
import { boardingRows, canAccessBoarding } from "../lib/boarding";

export default function BoardingDetails({ resident }: { resident: Resident }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold">Boarding Information</h3>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        {boardingRows(resident).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 break-words font-semibold text-slate-800">
              {value === null || value === undefined || value === ""
                ? "Not provided"
                : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      {canAccessBoarding(resident.boarding_status) && (
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Information reported in the census. Assigned houses and recorded stays
          are managed separately by the barangay.
        </p>
      )}
    </section>
  );
}
