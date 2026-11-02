export interface IncidentPin {
  latitude: string;
  longitude: string;
  accuracy: number | null;
}
export function parseIncidentPin(pin: IncidentPin) {
  const lat = pin.latitude.trim(),
    lon = pin.longitude.trim();
  if (!lat && !lon) return { latitude: null, longitude: null, accuracy: null };
  const latitude = Number(lat),
    longitude = Number(lon);
  if (
    !lat ||
    !lon ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    throw new Error(
      "Enter both valid coordinates, or clear the optional location pin.",
    );
  return { latitude, longitude, accuracy: pin.accuracy };
}
export function incidentMapUrl(
  latitude?: number | null,
  longitude?: number | null,
) {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}
export const INCIDENT_PROGRESS = [
  {
    value: "submitted",
    label: "Submitted",
    description: "Waiting for the barangay to review your report.",
  },
  {
    value: "under_review",
    label: "Under Review",
    description:
      "The barangay is reviewing the report and may request more details.",
  },
  {
    value: "in_progress",
    label: "In Progress",
    description: "The barangay has recorded that action is in progress.",
  },
  {
    value: "resolved",
    label: "Resolved",
    description:
      "The barangay marked the report resolved. Read the action taken below.",
  },
];
