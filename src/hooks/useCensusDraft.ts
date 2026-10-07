import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { censusDraftPayload, sameRecordVersion } from "../lib/censusDraft";
import type { CensusDraft, Json } from "../types/database";

export function useCensusDraft({
  userId,
  mode,
  ready,
  disabled,
  baseVersion,
  payload,
  onRestore,
}: {
  userId?: string;
  mode: "create" | "update";
  ready: boolean;
  disabled: boolean;
  baseVersion: string | null;
  payload: Record<string, Json>;
  onRestore: (payload: Record<string, Json>) => void;
}) {
  const [state, setState] = useState({
    loaded: false,
    saving: false,
    savedAt: "",
    error: "",
    restored: false,
  });
  const [outdated, setOutdated] = useState<CensusDraft | null>(null);
  const revision = useRef(0);
  const savedPayload = useRef("");
  const request = useRef(0);
  const saving = useRef(false);
  const blocked = useRef(false);
  const latest = useRef(payload);
  latest.current = payload;
  const serialized = JSON.stringify(payload);

  useEffect(() => {
    if (!ready || !userId) return;
    const generation = ++request.current;
    blocked.current = false;
    saving.current = false;
    revision.current = 0;
    setState({
      loaded: false,
      saving: false,
      savedAt: "",
      error: "",
      restored: false,
    });
    setOutdated(null);
    void supabase
      .from("census_drafts")
      .select("*")
      .eq("user_id", userId)
      .eq("mode", mode)
      .maybeSingle()
      .then(({ data, error }) => {
        if (generation !== request.current) return;
        if (error) {
          blocked.current = true;
          setState((s) => ({
            ...s,
            loaded: true,
            error: `Draft recovery unavailable: ${error.message}. Reload before saving a draft.`,
          }));
          return;
        }
        const draft = data as CensusDraft | null;
        if (draft) {
          revision.current = Number(draft.revision);
          if (
            mode === "update" &&
            !sameRecordVersion(draft.base_resident_updated_at, baseVersion)
          ) {
            blocked.current = true;
            setOutdated(draft);
          } else {
            const restored = censusDraftPayload(draft.payload);
            // Fill fields only; account-linked fields and uploaded files never come from a draft.
            onRestore(restored);
            savedPayload.current = JSON.stringify({
              ...latest.current,
              ...restored,
            });
          }
        } else savedPayload.current = JSON.stringify(latest.current);
        setState({
          loaded: true,
          saving: false,
          error: "",
          savedAt: draft?.saved_at ?? "",
          restored: Boolean(draft),
        });
      });
    return () => {
      ++request.current;
    };
  }, [userId, mode, ready, baseVersion, onRestore]);

  const save = useCallback(async () => {
    if (!userId || !ready || disabled || blocked.current || saving.current)
      return;
    const snapshot = JSON.stringify(latest.current);
    const generation = request.current;
    saving.current = true;
    setState((s) => ({ ...s, saving: true }));
    try {
      const { data, error } = await supabase.rpc("save_census_draft", {
        p_mode: mode,
        p_payload: latest.current,
        p_expected_revision: revision.current,
        p_base_updated_at: baseVersion,
      });
      if (generation !== request.current) return;
      if (error) {
        if (error.code === "40001") blocked.current = true;
        throw error;
      }
      const draft = data as unknown as CensusDraft;
      if (!draft?.revision) throw new Error("Draft save was not confirmed.");
      revision.current = Number(draft.revision);
      savedPayload.current = snapshot;
      setState((s) => ({ ...s, savedAt: draft.saved_at, error: "" }));
    } catch (error) {
      if (generation === request.current)
        setState((s) => ({
          ...s,
          error:
            error && typeof error === "object" && "message" in error
              ? String(error.message)
              : "Draft could not be saved. Check your connection and retry.",
        }));
    } finally {
      if (generation === request.current) {
        saving.current = false;
        setState((s) => ({ ...s, saving: false }));
      }
    }
  }, [userId, mode, ready, disabled, baseVersion]);

  useEffect(() => {
    if (
      !state.loaded ||
      disabled ||
      state.saving ||
      state.error ||
      blocked.current ||
      serialized === savedPayload.current
    )
      return;
    const timer = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(timer);
  }, [serialized, state.loaded, state.saving, state.error, disabled, save]);
  useEffect(() => {
    const retry = () => {
      if (state.loaded) void save();
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [save, state.loaded]);

  const discardOutdated = async () => {
    if (!outdated || saving.current || disabled) return;
    const generation = request.current;
    saving.current = true;
    setState((s) => ({ ...s, saving: true }));
    const { error } = await supabase.rpc("delete_census_draft", {
      p_mode: mode,
      p_expected_revision: revision.current,
    });
    if (generation !== request.current) return;
    saving.current = false;
    if (error) {
      setState((s) => ({ ...s, saving: false, error: error.message }));
      return;
    }
    revision.current = 0;
    blocked.current = false;
    savedPayload.current = JSON.stringify(latest.current);
    setOutdated(null);
    setState((s) => ({
      ...s,
      saving: false,
      savedAt: "",
      error: "",
      restored: false,
    }));
  };
  return {
    ...state,
    outdated,
    save,
    discardOutdated,
    dirty: serialized !== savedPayload.current,
  };
}
