/** Front and unspecified webcams use the familiar selfie preview; rear cameras do not. */
export function mirrorCameraPreview(stream: MediaStream): boolean {
  const track = stream.getVideoTracks?.()[0] ?? stream.getTracks()[0];
  return track?.getSettings?.().facingMode !== "environment";
}

/** Landmarks come from raw camera pixels, where the person's left is screen-right. */
export function detectsHeadTurn(action: "turn_left" | "turn_right", rawYaw: number): boolean {
  return action === "turn_left" ? rawYaw >= 0.12 : rawYaw <= -0.12;
}
