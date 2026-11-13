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

// Dashboard details share their parent route and retain the list's filters.
export function dashboardListRoute(route: string) {
  const [path, query = ""] = route.split("?");
  if (path !== "/admin/dashboard" && path !== "/resident/dashboard")
    return route;
  const params = new URLSearchParams(query);
  if (!params.has("item") && !params.has("appointment")) return route;
  params.delete("item");
  params.delete("appointment");
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function closeDashboardDetail() {
  const route = currentRoute();
  const parent = dashboardListRoute(route);
  if (parent === route) return;
  const { barangayIndex, barangayPages } = window.history.state ?? {};
  // If the detail was opened from its list, go back to the original list
  // entry. For deep links or cross-tab notifications, replace the detail.
  if (
    Array.isArray(barangayPages) &&
    barangayPages.some(
      (entry) =>
        Array.isArray(entry) &&
        entry[0] === barangayIndex - 1 &&
        entry[1] === parent,
    )
  ) window.history.back();
  else navigateHash(parent, true);
}
