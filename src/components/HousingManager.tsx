import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Resident } from "../types/database";
import { useAuth } from "../context/AuthContext";
import { canAccessBoarding } from "../lib/boarding";
import { errorMessage, titleCase } from "../lib/community";
import { manilaDate, paymentTime } from "../lib/payments";
import { usePagedQuery, searchPattern } from "../hooks/usePagedQuery";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useHashRoute } from "../hooks/useHashRoute";
import PaginationControls from "./PaginationControls";
interface House {
  id: string;
  name: string;
  address: string;
  owner_name: string;
  owner_resident_id: string;
  active: boolean;
}
interface CountEvent {
  id: string;
  action: string;
  quantity: number;
  before_count: number | null;
  after_count: number;
  effective_date: string;
  recorded_at: string;
  actor_role: string;
}
interface Summary {
  registered: { current: number; arrivals: number; departures: number };
  reported: {
    current: number | null;
    version: number;
    effective_date: string | null;
    arrivals: number;
    departures: number;
    corrections: number;
  } | null;
  can_manage: boolean;
  events: CountEvent[];
  history_total: number;
}
const blankHouse = {
  name: "",
  address: "",
  owner_resident_id: "",
  active: true,
};
export default function HousingManager({
  admin = false,
  resident,
}: {
  admin?: boolean;
  resident?: Resident;
}) {
  const { user } = useAuth(),
    route = useHashRoute(),
    requested = new URLSearchParams(route.split("?")[1] ?? "").get("house");
  const authorized = Boolean(
    user && (admin || canAccessBoarding(resident?.boarding_status)),
  );
  const [houseId, setHouseId] = useState(requested ?? ""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [summary, setSummary] = useState<Summary | null>(null),
    [historyPage, setHistoryPage] = useState(1),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState("baseline"),
    [quantity, setQuantity] = useState(""),
    [date, setDate] = useState(manilaDate());
  const [houseForm, setHouseForm] = useState<
    (typeof blankHouse & { id?: string }) | null
  >(null);
  const generation = useRef(0),
    lock = useRef(false),
    mounted = useRef(true),
    retry = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++generation.current;
    };
  }, []);
  const query = useCallback(
    (start: number, end: number) => {
      let q = supabase
        .from("boarding_houses")
        .select("id,name,address,owner_name,owner_resident_id,active", {
          count: "exact",
        });
      if (search.trim()) q = q.ilike("name", searchPattern(search));
      return q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(start, end);
    },
    [search],
  );
  const list = usePagedQuery<House>({
    page,
    pageSize: 10,
    onPageChange: setPage,
    query,
    enabled: authorized,
  });
  const selected =
    list.rows.find((h) => h.id === houseId) ??
    (!houseId ? list.rows[0] : undefined);
  const selectedId = selected?.id;
  useEffect(() => {
    setPage(1);
    setHouseId("");
  }, [search]);
  const load = useCallback(async () => {
    const serial = ++generation.current;
    if (!selectedId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    try {
      const r = await supabase.rpc("boarding_count_summary", {
        p_house_id: selectedId,
        p_from: from || null,
        p_to: to || null,
        p_offset: (historyPage - 1) * 10,
        p_limit: 10,
      });
      if (serial !== generation.current) return;
      setLoading(false);
      if (r.error) {
        setError(r.error.message);
        return;
      }
      setSummary(r.data as unknown as Summary);
      setError("");
    } catch (e) {
      if (serial === generation.current) {
        setError(errorMessage(e));
        setSummary(null);
        setLoading(false);
      }
    }
  }, [selectedId, from, to, historyPage]);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      ++generation.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  useEffect(() => {
    setHistoryPage(1);
    setQuantity("");
    setSuccess("");
    retry.current = null;
  }, [selectedId, from, to]);
  async function saveCount(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !selectedId || !summary?.can_manage) return;
    const value = Number(quantity);
    const chosen =
      summary.reported?.current == null
        ? "baseline"
        : action === "baseline"
          ? "arrival"
          : action;
    if (
      !quantity.trim() ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100000 ||
      ((chosen === "arrival" || chosen === "departure") && value === 0)
    ) {
      setError(
        "Enter a valid whole count. Arrivals and departures must be greater than zero.",
      );
      return;
    }
    const args = {
      p_house_id: selectedId,
      p_action: chosen,
      p_quantity: value,
      p_date: date,
      p_expected_version: summary.reported?.version ?? 0,
    };
    const payload = JSON.stringify(args);
    if (retry.current?.payload !== payload)
      retry.current = { payload, key: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("record_boarding_count", {
        ...args,
        p_request_key: retry.current.key,
      });
      if (r.error) throw r.error;
      if (!(r.data as { id?: string })?.id)
        throw new Error(
          "Count update was not confirmed. Retry the same entry.",
        );
      if (!mounted.current) return;
      retry.current = null;
      setQuantity("");
      setSuccess("Reported count saved with its audit history.");
      await load();
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (!authorized) return null;
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Boarding House Counts</h2>
        <p className="mt-2 text-sm text-slate-600">
          Registered stays and landlord-reported counts are separate sources.
          Never add them together or add aggregate boarder counts to the census
          resident total. These views return counts without a named boarder
          roster.
        </p>
      </div>
      {(error || list.error) && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error || list.error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-xl bg-pine-50 p-4">
          {success}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="label flex-1">
          Find a Boarding House
          <input
            type="search"
            className="input mt-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {admin && (
          <button
            type="button"
            onClick={() => setHouseForm(blankHouse)}
            className="rounded-xl bg-pine-700 px-4 py-3 font-bold text-white"
          >
            Assign Boarding House
          </button>
        )}
      </div>
      {list.loading ? (
        <p role="status">Loading boarding houses…</p>
      ) : !list.rows.length ? (
        <p className="rounded-2xl border border-dashed p-8 text-slate-500">
          No assigned boarding house is available. Contact the barangay office
          to check the assignment.
        </p>
      ) : (
        <>
          <label className="label">
            Boarding House
            <select
              className="input mt-2"
              value={selectedId ?? ""}
              onChange={(e) => {
                setHouseId(e.target.value);
                setHistoryPage(1);
              }}
            >
              <option value="" disabled>
                Select a House
              </option>
              {list.rows.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.active ? "" : " (Inactive)"}
                </option>
              ))}
            </select>
          </label>
          <PaginationControls
            page={page}
            totalItems={list.total}
            pageSize={10}
            onPageChange={(value) => {
              setPage(value);
              setHouseId("");
            }}
          />
          {selected && (
            <div className="rounded-2xl border bg-white p-5">
              <h3 className="text-lg font-bold">{selected.name}</h3>
              <p className="mt-1 break-words text-sm">{selected.address}</p>
              <p className="mt-1 text-sm text-slate-500">
                Landlord/Landlady: {selected.owner_name}
              </p>
              {admin && (
                <button
                  type="button"
                  className="mt-3 text-sm font-bold text-pine-700 underline"
                  onClick={() =>
                    setHouseForm({
                      id: selected.id,
                      name: selected.name,
                      address: selected.address,
                      owner_resident_id: selected.owner_resident_id,
                      active: selected.active,
                    })
                  }
                >
                  Edit Assignment
                </button>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">
              Activity From
              <input
                type="date"
                className="input mt-2"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="label">
              Activity Through
              <input
                type="date"
                min={from}
                className="input mt-2"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          {loading ? (
            <p role="status">Loading counts…</p>
          ) : (
            summary && (
              <>
                <CountCards
                  title="Registered Stay Records"
                  current={summary.registered.current}
                  arrivals={summary.registered.arrivals}
                  departures={summary.registered.departures}
                />
                <p className="text-xs text-slate-500">
                  Current registered boarders are distinct residents with an
                  active stay. Arrivals and departures count recorded stays in
                  the selected period.
                </p>
                {summary.can_manage && summary.reported && (
                  <>
                    <CountCards
                      title="Landlord-Reported Counts"
                      current={summary.reported.current}
                      arrivals={summary.reported.arrivals}
                      departures={summary.reported.departures}
                    />
                    <p className="text-xs text-slate-500">
                      Current reported count is the latest ledger balance
                      {summary.reported.effective_date
                        ? ` as of ${summary.reported.effective_date}`
                        : "; no initial count has been recorded"}
                      . Period activity excludes initial balances and
                      corrections; {summary.reported.corrections} corrections in
                      this period. Existing census-reported tenant fields are
                      retained separately and are not automatically imported.
                    </p>
                    {selected?.active && (
                      <form
                        onSubmit={(e) => void saveCount(e)}
                        className="space-y-3 rounded-2xl border bg-white p-5"
                      >
                        <h4 className="font-bold">Update Reported Counts</h4>
                        <label className="label">
                          Action
                          <select
                            className="input mt-2"
                            disabled={busy || summary.reported.current == null}
                            value={
                              summary.reported.current == null
                                ? "baseline"
                                : action === "baseline"
                                  ? "arrival"
                                  : action
                            }
                            onChange={(e) => setAction(e.target.value)}
                          >
                            {summary.reported.current == null ? (
                              <option value="baseline">
                                Initial Current Count
                              </option>
                            ) : (
                              <>
                                <option value="arrival">Record Arrivals</option>
                                <option value="departure">
                                  Record Departures
                                </option>
                                <option value="correction">
                                  Correct Current Count
                                </option>
                              </>
                            )}
                          </select>
                        </label>
                        <label className="label">
                          {summary.reported.current == null ||
                          action === "correction"
                            ? "New Current Count"
                            : "Number of Arrivals / Departures"}
                          <input
                            required
                            type="number"
                            min="0"
                            max="100000"
                            step="1"
                            className="input mt-2"
                            value={quantity}
                            disabled={busy}
                            onChange={(e) => setQuantity(e.target.value)}
                          />
                        </label>
                        <label className="label">
                          Effective Date
                          <input
                            required
                            type="date"
                            min={
                              summary.reported.effective_date ?? "1900-01-01"
                            }
                            max={manilaDate()}
                            className="input mt-2"
                            value={date}
                            disabled={busy}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </label>
                        <p className="text-xs text-slate-500">
                          Corrections set the balance and retain prior entries.
                          Departures cannot make the balance negative.
                        </p>
                        <button
                          type="submit"
                          disabled={busy}
                          className="rounded-xl bg-pine-700 px-4 py-3 font-bold text-white disabled:opacity-50"
                        >
                          {busy ? "Saving…" : "Save Count Update"}
                        </button>
                      </form>
                    )}
                    <div className="rounded-2xl border bg-white p-5">
                      <h4 className="font-bold">Reported Count History</h4>
                      {!summary.events.length && (
                        <p className="mt-3 text-sm text-slate-500">
                          No count entries in the selected period.
                        </p>
                      )}
                      {summary.events.map((entry) => (
                        <div
                          key={entry.id}
                          className="mt-3 border-t pt-3 text-sm"
                        >
                          <strong>
                            {titleCase(entry.action)}: {entry.quantity}
                          </strong>
                          <p>
                            Balance: {entry.before_count ?? "Not Set"} →{" "}
                            {entry.after_count} · Effective{" "}
                            {entry.effective_date}
                          </p>
                          <p className="text-xs text-slate-500">
                            {entry.actor_role} ·{" "}
                            {paymentTime(entry.recorded_at)}
                          </p>
                        </div>
                      ))}
                      <PaginationControls
                        page={historyPage}
                        totalItems={summary.history_total}
                        pageSize={10}
                        onPageChange={setHistoryPage}
                      />
                    </div>
                  </>
                )}
              </>
            )
          )}
        </>
      )}
      {houseForm && (
        <HouseEditor
          initial={houseForm}
          close={() => setHouseForm(null)}
          saved={() => {
            setHouseForm(null);
            void list.reload();
            void load();
          }}
        />
      )}
    </section>
  );
}
function CountCards({
  title,
  current,
  arrivals,
  departures,
}: {
  title: string;
  current: number | null;
  arrivals: number;
  departures: number;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h3 className="font-bold">{title}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ["Current Boarders", current ?? "Not Reported"],
          ["Arrivals During Selected Period", arrivals],
          ["Departures During Selected Period", departures],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-pine-800">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
function HouseEditor({
  initial,
  close,
  saved,
}: {
  initial: typeof blankHouse & { id?: string };
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState(initial),
    [search, setSearch] = useState(""),
    [owners, setOwners] = useState<
      Pick<Resident, "id" | "first_name" | "last_name">[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    mounted = useRef(true);
  const dialog = useDialogFocus<HTMLDivElement>(
    true,
    () => {
      if (!busy) close();
    },
    null,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      let q = supabase
        .from("admin_resident_records")
        .select("id,first_name,last_name")
        .eq("boarding_status", "landlord")
        .not("user_id", "is", null);
      if (search.trim()) q = q.ilike("search_text", searchPattern(search));
      const results = await Promise.all([
        q.order("last_name").order("id").limit(20),
        form.owner_resident_id
          ? supabase
              .from("admin_resident_records")
              .select("id,first_name,last_name")
              .eq("id", form.owner_resident_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!active) return;
      const failure = results.find((r) => r.error);
      if (failure?.error) {
        setError(failure.error.message);
        return;
      }
      const options = results[0].data ?? [];
      const selected = results[1].data;
      if (selected && !options.some((o) => o.id === selected.id))
        options.unshift(selected);
      setOwners(options);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, form.owner_resident_id]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("manage_boarding", {
        p_action: "save_house",
        p_payload: form,
      });
      if (r.error) throw r.error;
      if (mounted.current) saved();
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Boarding house assignment"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4"
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="dialog-panel w-full max-w-lg space-y-4 rounded-3xl bg-white p-6"
      >
        <h3 className="text-xl font-bold">
          {form.id ? "Edit" : "Assign"} Boarding House
        </h3>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <label className="label">
          House Name
          <input
            required
            minLength={2}
            maxLength={150}
            className="input mt-2"
            value={form.name}
            disabled={busy}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="label">
          Address
          <input
            required
            minLength={3}
            maxLength={500}
            className="input mt-2"
            value={form.address}
            disabled={busy}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <label className="label">
          Find Registered Landlord/Landlady
          <input
            type="search"
            className="input mt-2"
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="label">
          Assigned Account
          <select
            required
            className="input mt-2"
            value={form.owner_resident_id}
            disabled={busy}
            onChange={(e) =>
              setForm({ ...form, owner_resident_id: e.target.value })
            }
          >
            <option value="">Select an Account</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.first_name} {o.last_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            disabled={busy}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-pine-700 px-4 py-3 font-bold text-white"
          >
            {busy ? "Saving…" : "Save Assignment"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="rounded-xl border px-4 py-3"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
