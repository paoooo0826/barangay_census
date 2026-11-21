import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

// Re-fetch the authoritative count instead of incrementing for each delivered event.
// RLS filters every Postgres Changes row before delivery, including after reconnect.
export function useMessagingUpdates(
  scope: string | undefined,
  tables: Array<{ table: string; filter?: string }>,
  refresh: () => void,
) {
  const current = useRef(refresh);
  useEffect(() => {
    current.current = refresh;
  }, [refresh]);
  const subscriptions = JSON.stringify(tables);
  useEffect(() => {
    if (!scope || !supabase.channel) return;
    let active = true;
    let timer: number | undefined;
    const schedule = () => {
      if (!active) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (active) current.current();
      }, 75);
    };
    let channel = supabase.channel(`messaging:${scope}:${crypto.randomUUID()}`);
    for (const item of JSON.parse(subscriptions) as Array<{
      table: string;
      filter?: string;
    }>)
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", ...item },
        schedule,
      );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") schedule();
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [scope, subscriptions]);
}
