import { LIVENESS_LIMITS } from "./liveness";

/** Landmarks come from raw camera pixels, where the person's left is screen-right. */
export function detectsHeadTurn(
  action: "turn_left" | "turn_right",
  rawYaw: number,
): boolean {
  if (!Number.isFinite(rawYaw)) return false;
  return action === "turn_left"
    ? rawYaw >= LIVENESS_LIMITS.headTurnYaw
    : rawYaw <= -LIVENESS_LIMITS.headTurnYaw;
}
