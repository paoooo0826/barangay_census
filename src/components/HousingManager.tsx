import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Resident } from "../types/database";
import { searchPattern } from "../hooks/usePagedQuery";
import PaginationControls from "./PaginationControls";

interface House {
  id: string;
  name: string;
  address: string;
  owner_resident_id: string;
  owner_user_id: string;
  owner_name: string;
  active: boolean;
}
interface Stay {
  id: string;
  boarding_house_id: string;
  resident_id: string;
  resident_name: string;
  tracking_number: string;
  move_in_date: string;
  departure_date: string | null;
  status: "staying" | "moved_out";
  updater_name: string;
  updated_at: string;
}
interface Event {
  id: string;
  action: string;
  effective_date: string;
  updater_name: string;
  recorded_at: string;
}
const PAGE_SIZE = 10;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const blankHouse = {
  name: "",
  address: "",
  owner_resident_id: "",
  active: true,
};
export default function HousingManager({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  const mutationLock = useRef(false);
  const stayRequest = useRef(0);
  const eventRequest = useRef(0);
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState("");
  const [stays, setStays] = useState<Stay[]>([]);
  const [status, setStatus] = useState<"staying" | "moved_out">("staying");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [houseForm, setHouseForm] = useState<
    (typeof blankHouse & { id?: string }) | null
  >(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [residents, setResidents] = useState<Resident[]>([]);
  const selectedOwnerId = houseForm?.owner_resident_id;
  const choosingOwner = Boolean(houseForm);
  useEffect(() => {
    if (!admin || !choosingOwner) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      let query = supabase
        .from("admin_resident_records")
        .select("id,user_id,first_name,last_name,tracking_number")
        .not("user_id", "is", null);
      if (ownerSearch.trim())
        query = query.ilike("search_text", searchPattern(ownerSearch));
      const [options, selected] = await Promise.all([
        query.order("last_name").order("id").limit(20),
        selectedOwnerId
          ? supabase
              .from("residents")
              .select("id,user_id,first_name,last_name,tracking_number")
              .eq("id", selectedOwnerId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!active) return;
      if (options.error || selected.error)
        setError(
          options.error?.message ||
            selected.error?.message ||
            "Unable to load owners.",
        );
      else {
        const rows = (options.data ?? []) as Resident[];
        const currentOwner = selected.data;
        if (currentOwner && !rows.some((r) => r.id === currentOwner.id))
          rows.unshift(currentOwner as Resident);
        setResidents(rows);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [admin, choosingOwner, selectedOwnerId, ownerSearch]);
  const [tracking, setTracking] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [departing, setDeparting] = useState<Stay | null>(null);
  const [departure, setDeparture] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [eventStay, setEventStay] = useState<Stay | null>(null);
  const house = houses.find((h) => h.id === houseId);
  const canManage = Boolean(
    house && (admin || house.owner_user_id === user?.id),
  );
  const loadHouses = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("boarding_houses")
      .select("*")
      .order("name")
      .limit(500);
    if (e) setError(e.message);
    else {
      setHouses((data ?? []) as House[]);
      setHouseId((id) =>
        data?.some((h) => h.id === id) ? id : data?.[0]?.id || "",
      );
    }
  }, []);
  const loadStays = useCallback(async () => {
    const request = ++stayRequest.current;
    if (!houseId) {
      setStays([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("boarder_stays")
      .select("*", { count: "exact" })
      .eq("boarding_house_id", houseId)
      .eq("status", status);
    const clean = search.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
    if (clean)
      q = q.or(
        `resident_name.ilike.%${clean}%,tracking_number.ilike.%${clean}%`,
      );
    const {
      data,
      error: e,
      count,
    } = await q
      .order("move_in_date", { ascending: false })
      .order("id")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (request !== stayRequest.current) return;
    if (e) setError(e.message);
    else {
      setStays((data ?? []) as Stay[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [houseId, status, search, page]);
  useEffect(() => {
    void loadHouses();
  }, [loadHouses]);
  useEffect(() => {
    void loadStays();
  }, [loadStays]);
  useEffect(() => {
    if (page > Math.max(1, Math.ceil(total / PAGE_SIZE)))
      setPage(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  }, [page, total]);
  async function mutate(
    action: string,
    payload: Record<string, string | boolean>,
  ) {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const { error: e } = await supabase.rpc("manage_boarding", {
        p_action: action,
        p_payload: payload,
      });
      if (e) throw e;
      setSuccess(
        action === "save_house"
          ? "Boarding house assignment saved."
          : action === "move_in"
            ? "Move-in recorded."
            : "Departure recorded. Previous stay is preserved.",
      );
      await loadHouses();
      await loadStays();
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : ((e as { message?: string })?.message ??
              "Unable to save occupancy."),
      );
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  async function showHistory(stay: Stay) {
    const request = ++eventRequest.current;
    setError("");
    setEventStay(stay);
    setEvents([]);
    const { data, error: e } = await supabase
      .from("boarder_occupancy_history")
      .select("*")
      .eq("stay_id", stay.id)
      .order("recorded_at", { ascending: false });
    if (request !== eventRequest.current) return;
    if (e) setError(e.message);
    else setEvents((data ?? []) as Event[]);
  }
  function closeDeparture() {
    if (
      !busy &&
      (!departure || window.confirm("Discard the unsaved departure date?"))
    ) {
      setDeparting(null);
      setDeparture("");
    }
  }
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            Boarding Houses and Boarder Records
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Occupancy records are separate from barangay residency. Only
            assigned owners and administrators can update stays.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void loadHouses();
            void loadStays();
          }}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="my-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="my-4 rounded-xl bg-sage-50 p-3 text-sm text-sage-800"
        >
          {success}
        </p>
      )}
      {admin && (
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={() => setHouseForm({ ...blankHouse })}
        >
          Assign Boarding House
        </button>
      )}
      <label className="label mt-5 block">
        Boarding house
        <select
          className="input mt-2"
          value={houseId}
          onChange={(e) => {
            setHouseId(e.target.value);
            setPage(1);
            setEventStay(null);
          }}
        >
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} — {h.owner_name}
              {h.active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </label>
      {!houses.length && (
        <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
          {admin
            ? "No boarding houses have been assigned yet."
            : "No boarding-house records are linked to your account. Ask the barangay administrator to assign your house if you are its owner."}
        </p>
      )}
      {house && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-pine-50 p-4 text-sm">
            <div>
              <strong>{house.name}</strong>
              <p>{house.address}</p>
              <p>Landlord/Landlady: {house.owner_name}</p>
            </div>
            {admin && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setHouseForm({
                    id: house.id,
                    name: house.name,
                    address: house.address,
                    owner_resident_id: house.owner_resident_id,
                    active: house.active,
                  })
                }
              >
                Edit Assignment
              </button>
            )}
          </div>
          {canManage && house.active && (
            <form
              className="mt-5 grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate("move_in", {
                    house_id: houseId,
                    tracking_number: tracking.trim(),
                    move_in_date: moveIn,
                  })
                ) {
                  setTracking("");
                  setMoveIn("");
                  setStatus("staying");
                  setPage(1);
                }
              }}
            >
              <label className="label">
                Resident tracking number <span className="text-red-600">*</span>
                <input
                  className="input mt-2"
                  required
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="BC-2026-…"
                />
              </label>
              <label className="label">
                Move-in date <span className="text-red-600">*</span>
                <input
                  className="input mt-2"
                  type="date"
                  required
                  max={today()}
                  value={moveIn}
                  onChange={(e) => setMoveIn(e.target.value)}
                />
              </label>
              <button
                disabled={busy}
                className="btn-primary self-end"
                type="submit"
              >
                {busy ? "Saving…" : "Record Move-in"}
              </button>
            </form>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {(["staying", "moved_out"] as const).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => {
                  setStatus(v);
                  setPage(1);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${status === v ? "bg-pine-700 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {v === "staying" ? "Currently Staying" : "Departure History"}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label="Search boarders"
            className="input my-4"
            value={search}
            placeholder="Search boarder name or tracking number"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <p className="mb-3 text-sm text-slate-500">
            {total} matching{" "}
            {status === "staying" ? "current boarders" : "past stays"}
          </p>
          {loading ? (
            <p className="text-sm text-slate-500">Loading boarders…</p>
          ) : (
            stays.map((s) => (
              <article
                key={s.id}
                className="mb-3 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row"
              >
                <div>
                  <p className="font-bold">{s.resident_name}</p>
                  <p className="text-sm text-slate-600">
                    {s.tracking_number} · Move-in: {s.move_in_date}
                  </p>
                  <p className="text-sm text-slate-600">
                    {s.status === "staying"
                      ? "Currently staying"
                      : `Moved out: ${s.departure_date}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Updated by {s.updater_name} ·{" "}
                    {new Date(s.updated_at).toLocaleString("en-PH")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void showHistory(s)}
                  >
                    View History
                  </button>
                  {admin && (
                    <a
                      className="btn-secondary"
                      href={`#/admin/review/${s.resident_id}`}
                    >
                      Resident Details
                    </a>
                  )}
                  {canManage && s.status === "staying" && (
                    <button
                      type="button"
                      className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900"
                      disabled={busy}
                      onClick={() => {
                        setDeparting(s);
                        setDeparture("");
                      }}
                    >
                      Mark Moved Out
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
          {!loading && !stays.length && (
            <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
              No matching boarder records.
            </p>
          )}
          <PaginationControls
            page={page}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
      {houseForm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(e) => {
            if (
              e.target === e.currentTarget &&
              !busy &&
              window.confirm("Discard unsaved boarding-house changes?")
            )
              setHouseForm(null);
          }}
        >
          <form
            className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("save_house", houseForm)) setHouseForm(null);
            }}
          >
            <h3 className="text-xl font-bold">
              {houseForm.id ? "Edit" : "Assign"} Boarding House
            </h3>
            <label className="label block">
              House name <span className="text-red-600">*</span>
              <input
                required
                minLength={2}
                maxLength={150}
                className="input mt-2"
                value={houseForm.name}
                onChange={(e) =>
                  setHouseForm({ ...houseForm, name: e.target.value })
                }
              />
            </label>
            <label className="label block">
              Address <span className="text-red-600">*</span>
              <input
                required
                minLength={3}
                maxLength={500}
                className="input mt-2"
                value={houseForm.address}
                onChange={(e) =>
                  setHouseForm({ ...houseForm, address: e.target.value })
                }
              />
            </label>
            <label className="label block">
              Assigned landlord/landlady <span className="text-red-600">*</span>
              <input
                className="input mt-2"
                placeholder="Search owner's name or tracking number"
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Showing up to 20 matches. Search to find another owner.
              </span>
              <select
                required
                className="input mt-2"
                value={houseForm.owner_resident_id}
                onChange={(e) =>
                  setHouseForm({
                    ...houseForm,
                    owner_resident_id: e.target.value,
                  })
                }
              >
                <option value="">Choose registered owner</option>
                {residents
                  .filter((r) => r.user_id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.first_name} {r.last_name} — {r.tracking_number}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={houseForm.active}
                onChange={(e) =>
                  setHouseForm({ ...houseForm, active: e.target.checked })
                }
              />
              Active boarding house
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                disabled={busy}
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (window.confirm("Discard unsaved boarding-house changes?"))
                    setHouseForm(null);
                }}
              >
                Close
              </button>
              <button disabled={busy} type="submit" className="btn-primary">
                Save Assignment
              </button>
            </div>
          </form>
        </div>
      )}
      {departing && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeparture();
          }}
        >
          <form
            className="dialog-panel w-full max-w-lg space-y-4 rounded-3xl bg-white p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate("move_out", {
                  stay_id: departing.id,
                  departure_date: departure,
                })
              ) {
                setDeparting(null);
                setDeparture("");
              }
            }}
          >
            <h3 className="text-xl font-bold">Record Departure</h3>
            <p className="text-sm">
              {departing.resident_name} · {house?.name}
            </p>
            <label className="label block">
              Departure date <span className="text-red-600">*</span>
              <input
                required
                type="date"
                min={departing.move_in_date}
                max={today()}
                className="input mt-2"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
              />
            </label>
            <p className="text-xs text-slate-500">
              This closes the stay, keeps its history, and does not change
              barangay residency.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                className="btn-secondary"
                onClick={closeDeparture}
              >
                Close
              </button>
              <button type="submit" disabled={busy} className="btn-primary">
                Save Departure
              </button>
            </div>
          </form>
        </div>
      )}
      {eventStay && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEventStay(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl bg-white p-6">
            <h3 className="text-xl font-bold">
              Stay History — {eventStay.resident_name}
            </h3>
            {events.map((e) => (
              <article
                className="rounded-xl bg-slate-50 p-3 text-sm"
                key={e.id}
              >
                <strong>
                  {e.action === "move_in" ? "Moved in" : "Moved out"}:{" "}
                  {e.effective_date}
                </strong>
                <p>Updated by {e.updater_name}</p>
                <p className="text-xs text-slate-500">
                  Recorded {new Date(e.recorded_at).toLocaleString("en-PH")}
                </p>
              </article>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEventStay(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
