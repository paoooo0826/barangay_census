import type { Resident } from "../types/database";

export interface AdminSummary {
  stats: { total: number; verified: number; pending: number; rejected: number };
  appointments: {
    total: number;
    today: number;
    completedToday: number;
    pending: number;
  };
  announcements: { active: number; archived: number; published: number };
  recentResidents: Resident[];
}
export const EMPTY_ADMIN_SUMMARY: AdminSummary = {
  stats: { total: 0, verified: 0, pending: 0, rejected: 0 },
  appointments: { total: 0, today: 0, completedToday: 0, pending: 0 },
  announcements: { active: 0, archived: 0, published: 0 },
  recentResidents: [],
};
