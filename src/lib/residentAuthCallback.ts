// Keep the existing allow-listed destination so old confirmation emails still work.
export function residentConfirmationRedirect() {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/resident`;
}

export function authFragment(hash: string) {
  return new URLSearchParams(hash.slice(1));
}

export function isAuthFragment(hash: string) {
  if (!hash || hash.startsWith("#/")) return false;
  const params = authFragment(hash);
  return [
    "access_token",
    "refresh_token",
    "error",
    "error_code",
    "error_description",
  ].some((key) => params.has(key));
}

export function readConfirmationCallback(
  location: Pick<Location, "search" | "hash">,
) {
  const query = new URLSearchParams(location.search);
  // Password recovery and signup have separate entry points.
  if (query.get("password-reset") === "1") return null;
  const fragment = authFragment(location.hash);
  if (
    ["error", "error_code", "error_description"].some(
      (key) => fragment.has(key) || query.has(key),
    )
  )
    return "invalid" as const;
  if (fragment.get("type") === "signup" && fragment.has("access_token"))
    return "signup" as const;
  return null;
}

// Capture only the outcome marker before the Auth client consumes the fragment.
export const initialConfirmationCallback = readConfirmationCallback(
  window.location,
);

export function hasPendingResidentVerification(userId: string) {
  try {
    const pending = JSON.parse(
      sessionStorage.getItem(`pendingResidentVerification:${userId}`) ?? "null",
    );
    return (
      pending?.userId === userId &&
      pending.verificationStatus === "passed" &&
      pending.livenessPassed === true &&
      typeof pending.idType === "string" &&
      Boolean(pending.idType.trim()) &&
      [
        pending.frontImagePath,
        pending.backImagePath,
        pending.capturedFacePath,
      ].every(
        (path) => typeof path === "string" && path.startsWith(`${userId}/`),
      )
    );
  } catch {
    return false;
  }
}
