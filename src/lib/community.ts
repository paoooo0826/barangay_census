import type { AppointmentStatus } from "../types/database";
export function appointmentLabel(
  status: AppointmentStatus | string,
  legacy = false,
) {
  if (legacy) return "Legacy Completed — Receipt Missing";
  return status === "confirmed" ? "Accepted" : titleCase(status);
}
export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function errorMessage(value: unknown) {
  return value && typeof value === "object" && "message" in value
    ? String(value.message)
    : "Unable to complete this action. Please retry.";
}
export interface CommunityCase {
  id: string;
  user_id: string;
  resident_id: string;
  status: string;
  response: string;
  created_at: string;
  updated_at: string;
  version: number;
  kind?: string;
  content?: string;
  tracking_reference?: string;
  category?: string;
  description?: string;
  location?: string;
  occurred_at?: string;
}
export const INCIDENT_CATEGORIES = [
  "safety_concern",
  "disturbance",
  "property_damage",
  "traffic",
  "environmental",
  "other",
];
export const FEEDBACK_STATUSES = ["new", "reviewed", "resolved"];
export const INCIDENT_STATUSES = [
  "submitted",
  "under_review",
  "in_progress",
  "resolved",
  "rejected",
];
