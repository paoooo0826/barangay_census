// Gesture thresholds are independent of the final ID-to-live face match.
export const LIVENESS_LIMITS = {
  smile: 0.5,
  headTurnYaw: 0.085,
  closerRatio: 1.2,
  faceConfidence: 0.45,
  blinkPollMs: 75,
  gesturePollMs: 150,
  blinkCalibrationFrames: 4,
  blinkCloseRatio: 0.76,
  blinkReopenRatio: 0.9,
} as const;

export interface BlinkState {
  baseline: number | null;
  samples: number[];
  closed: boolean;
  count: number;
}

export function initialBlinkState(): BlinkState {
  return { baseline: null, samples: [], closed: false, count: 0 };
}

export function updateBlink(state: BlinkState, ear: number): BlinkState {
  // Invalid/degenerate eye landmarks must never count as an eye closure.
  if (!Number.isFinite(ear) || ear < 0.06 || ear > 0.6)
    return interruptBlink(state);
  if (state.baseline === null) {
    const samples = [...state.samples, ear];
    if (samples.length < LIVENESS_LIMITS.blinkCalibrationFrames)
      return { ...state, samples };
    const sorted = [...samples].sort((a, b) => a - b);
    // The median tolerates one noisy frame or a blink during calibration.
    const baseline = (sorted[1] + sorted[2]) / 2;
    return { ...state, samples: [], baseline, closed: false };
  }
  if (ear <= state.baseline * LIVENESS_LIMITS.blinkCloseRatio)
    return { ...state, closed: true };
  if (ear >= state.baseline * LIVENESS_LIMITS.blinkReopenRatio && state.closed)
    return { ...state, closed: false, count: state.count + 1 };
  return state;
}

export function interruptBlink(state: BlinkState): BlinkState {
  return { ...state, closed: false, samples: [] };
}

export function detectsSmile(score: number): boolean {
  return Number.isFinite(score) && score >= LIVENESS_LIMITS.smile;
}

export function detectsMoveCloser(
  areaRatio: number,
  baseline: number,
): boolean {
  return (
    Number.isFinite(areaRatio) &&
    Number.isFinite(baseline) &&
    baseline > 0 &&
    areaRatio >= baseline * LIVENESS_LIMITS.closerRatio
  );
}
