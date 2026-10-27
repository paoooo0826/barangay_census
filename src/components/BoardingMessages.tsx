import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { updateHashQuery, useHashRoute } from "../hooks/useHashRoute";
import { usePagedQuery } from "../hooks/usePagedQuery";
import { errorMessage } from "../lib/community";
import { paymentTime } from "../lib/payments";
import PaginationControls from "./PaginationControls";
interface Conversation {
  id: string;
  name: string;
  owner_name: string;
  active: boolean;
  unread_count: number;
}
interface Message {
  id: string;
  sender_user_id: string;
  sender_role: string;
  body: string;
  created_at: string;
}
export default function BoardingMessages({
  admin = false,
}: {
  admin?: boolean;
}) {
  const { user } = useAuth();
  const route = useHashRoute();
  const requested = new URLSearchParams(route.split("?")[1] ?? "").get("house");
  const [houses, setHouses] = useState<Conversation[]>([]),
    [error, setError] = useState(""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const house =
    houses.find((h) => h.id === requested) ??
    (!requested ? houses[0] : undefined);
  const lock = useRef(false),
    generation = useRef(0),
    mounted = useRef(true),
    retry = useRef<{ payload: string; key: string } | null>(null);
  const loadHouses = useCallback(async () => {
    const serial = ++generation.current;
    try {
      const r = await supabase.rpc("boarding_conversations", {});
      if (serial !== generation.current) return;
      if (r.error) throw r.error;
      if (!Array.isArray(r.data))
        throw new Error("Unable to load conversations.");
      setHouses(r.data as unknown as Conversation[]);
      setError("");
    } catch (e) {
      if (serial === generation.current) setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void loadHouses();
    const refresh = () => {
      if (!document.hidden) void loadHouses();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      ++generation.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [loadHouses]);
  const houseId = house?.id;
  const query = useCallback(
    (start: number, end: number) =>
      supabase
        .from("boarding_messages")
        .select("id,sender_user_id,sender_role,body,created_at", {
          count: "exact",
        })
        .eq("boarding_house_id", houseId ?? "")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(start, end),
    [houseId],
  );
  const list = usePagedQuery<Message>({
    page,
    pageSize: 20,
    onPageChange: setPage,
    query,
    enabled: Boolean(houseId),
  });
  useEffect(() => {
    setPage(1);
    setBody("");
    retry.current = null;
  }, [houseId]);
  // Mark only messages fetched on the newest page as read; loading older history must not swallow new unread messages.
  useEffect(() => {
    if (
      !houseId ||
      list.loading ||
      list.error ||
      page !== 1 ||
      !list.rows.length ||
      document.hidden
    )
      return;
    let active = true;
    void supabase
      .rpc("mark_boarding_conversation_read", {
        p_house_id: houseId,
        p_through: list.rows[0].created_at,
      })
      .then(
        (r) => {
          if (!active) return;
          if (r.error) setError(r.error.message);
          else void loadHouses();
        },
        (e: unknown) => {
          if (active) setError(errorMessage(e));
        },
      );
    return () => {
      active = false;
    };
  }, [houseId, list.rows, list.loading, list.error, page, loadHouses]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !houseId) return;
    const clean = body.trim();
    if (!clean || clean.length > 4000) return;
    const payload = JSON.stringify([houseId, clean]);
    if (retry.current?.payload !== payload)
      retry.current = { payload, key: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("send_boarding_message", {
        p_house_id: houseId,
        p_body: clean,
        p_request_key: retry.current.key,
      });
      if (r.error) throw r.error;
      if (!(r.data as unknown as Message)?.id)
        throw new Error(
          "Message was not confirmed. Retry without changing it.",
        );
      if (!mounted.current) return;
      setBody("");
      retry.current = null;
      setPage(1);
      await Promise.all([list.reload(), loadHouses()]);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">
          {admin ? "Landlord Messages" : "Barangay Office Messages"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {admin
            ? "Communicate privately with the landlord/landlady assigned to each boarding house."
            : "Communicate privately with the barangay office about your assigned boarding house."}{" "}
          Do not send boarder identities or ID documents here.
        </p>
      </div>
      {(error || list.error) && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error || list.error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-2xl border bg-white p-4">
          <label className="label">
            Find a House
            <input
              className="input mt-2"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {houses
            .filter((h) => h.name.toLowerCase().includes(search.toLowerCase()))
            .map((h) => (
              <button
                type="button"
                key={h.id}
                disabled={busy}
                onClick={() => updateHashQuery({ house: h.id })}
                className={`block w-full rounded-xl border p-3 text-left text-sm ${h.id === houseId ? "bg-pine-50" : ""}`}
              >
                <strong className="break-words">{h.name}</strong>
                {h.unread_count > 0 && (
                  <span className="ml-2 rounded-full bg-red-600 px-2 text-xs text-white">
                    {h.unread_count} Unread
                  </span>
                )}
                <span className="mt-1 block text-xs text-slate-500">
                  {h.active ? "Active" : "Inactive"}
                </span>
              </button>
            ))}
          {!houses.length && (
            <p className="text-sm text-slate-500">
              No assigned conversations available.
            </p>
          )}
        </aside>
        <div className="min-w-0 rounded-2xl border bg-white p-5">
          {house ? (
            <>
              <h3 className="text-lg font-bold">{house.name}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {admin
                  ? `Landlord/Landlady: ${house.owner_name}`
                  : "Barangay Office"}{" "}
                · Newest messages first
              </p>
              <button
                type="button"
                className="mt-3 text-sm font-bold text-pine-700 underline"
                onClick={() => void list.reload()}
              >
                Refresh Messages
              </button>
              <div className="my-4 space-y-3">
                {list.loading ? (
                  <p role="status">Loading messages…</p>
                ) : !list.rows.length ? (
                  <p className="py-6 text-sm text-slate-500">
                    No messages yet.
                  </p>
                ) : (
                  list.rows.map((m) => (
                    <article
                      key={m.id}
                      className={`rounded-xl p-4 ${m.sender_user_id === user?.id ? "ml-5 bg-pine-50" : "mr-5 bg-slate-100"}`}
                    >
                      <strong className="text-sm">
                        {m.sender_user_id === user?.id
                          ? "You"
                          : m.sender_role === "admin"
                            ? "Barangay Administrator"
                            : "Landlord/Landlady"}
                      </strong>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                        {m.body}
                      </p>
                      <time className="mt-2 block text-xs text-slate-500">
                        {paymentTime(m.created_at)}
                      </time>
                    </article>
                  ))
                )}
              </div>
              <PaginationControls
                page={page}
                totalItems={list.total}
                pageSize={20}
                onPageChange={setPage}
              />
              <form
                onSubmit={(e) => void send(e)}
                className="mt-5 space-y-3 border-t pt-4"
              >
                <label className="label">
                  Message
                  <textarea
                    required
                    maxLength={4000}
                    rows={3}
                    className="input mt-2"
                    value={body}
                    disabled={busy}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !body.trim()}
                  className="rounded-xl bg-pine-700 px-5 py-3 font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send Message"}
                </button>
              </form>
            </>
          ) : (
            <p className="py-8 text-sm text-slate-500">
              {requested
                ? "This conversation is unavailable to your account."
                : "Select an assigned boarding house."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
