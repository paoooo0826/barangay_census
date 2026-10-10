import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
export interface CatalogService {
  code: string;
  label: string;
  description: string;
  base_fee: number;
  student_fee: number | null;
  requirements: string;
  processing: string;
  purposes: { value: string; label: string }[];
}
export function useServiceCatalog() {
  const [services, setServices] = useState<CatalogService[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void Promise.resolve(supabase.rpc("get_service_catalog")).then(
      ({ data, error }) => {
        if (!active) return;
        setError(error?.message ?? "");
        setServices(
          Array.isArray(data) ? (data as unknown as CatalogService[]) : [],
        );
        setLoading(false);
      },
      () => {
        if (active) {
          setError("Unable to load approved services. Check your connection.");
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return { services, error, loading };
}
export default function ServiceCatalog() {
  const { services, error, loading } = useServiceCatalog();
  return (
    <section className="mb-5 rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">Services and Approved Fees</h2>
      {loading && <p role="status">Loading service information…</p>}
      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {error}
        </p>
      )}
      {!loading && !error && services.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          No approved service information is available. Contact the barangay
          office.
        </p>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {services.map((s) => (
          <article key={s.code} className="min-w-0 rounded-xl bg-slate-50 p-4">
            <h3 className="font-bold text-pine-800">{s.label}</h3>
            <p className="mt-2 text-sm">{s.description}</p>
            <p className="mt-3 font-semibold">
              {s.student_fee !== null
                ? `₱${s.student_fee} currently studying / ₱${s.base_fee} otherwise`
                : `₱${s.base_fee}; first Low Income request is free`}
            </p>
            {s.purposes.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm">
                {s.purposes.map((p) => (
                  <li key={p.value}>{p.label}</li>
                ))}
              </ul>
            )}
            {s.code === "certificate_of_residency" && (
              <p className="mt-2 text-xs text-slate-600">
                The first-request exemption follows the existing rule: any
                previous Low Income request, including a cancelled or rejected
                one, uses the exemption.
              </p>
            )}
            <p className="mt-3 text-sm">
              <strong>Request details: </strong>
              {s.requirements}
            </p>
            <p className="mt-2 text-sm">
              <strong>Processing: </strong>
              {s.processing}
            </p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        The exact applicable fee is shown before confirmation and stored with
        the request. Legacy Indigency and Complaint requests remain available in
        history; new requests use the services above.
      </p>
    </section>
  );
}
