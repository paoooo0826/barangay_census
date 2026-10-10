import { useSyncExternalStore } from "react";
function currentRoute() {
  const route = window.location.hash.slice(1) || "/";
  return route.startsWith("/") ? route : `/${route}`;
}
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
export function useHashRoute() {
  return useSyncExternalStore(subscribe, currentRoute);
}
export function navigateHash(destination: string, replace = false) {
  const route = destination.startsWith("/") ? destination : `/${destination}`;
  if (route === currentRoute()) return;
  if (replace) {
    window.history.replaceState(window.history.state, "", `#${route}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else window.location.hash = route;
}
export function updateHashQuery(
  values: Record<string, string | null>,
  replace = false,
) {
  const [path, query = ""] = currentRoute().split("?");
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const search = params.toString();
  navigateHash(`${path}${search ? `?${search}` : ""}`, replace);
}
