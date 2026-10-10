import type { EducationStatus } from "../types/database";

export const EDUCATION_STATUS_OPTIONS: Array<{
  value: EducationStatus;
  label: string;
}> = [
  { value: "Currently Studying", label: "Currently Enrolled" },
  { value: "Completed", label: "Completed" },
  { value: "Not Currently Studying", label: "Not Currently Enrolled" },
  { value: "No Formal Education", label: "No Formal Education" },
];

export function educationStatusLabel(value?: string | null) {
  if (!value) return value ?? "";
  return (
    EDUCATION_STATUS_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

export function categoryLabel(value?: string | null) {
  if (value === "PWD") return "Person with Disability (PWD)";
  if (value === "FHONA") return "Family Head and other needy adults";
  return value ?? "";
}

const ANALYTICS_ACRONYMS = new Map([
  ["id", "ID"],
  ["ids", "IDs"],
  ["pwd", "PWD"],
  ["ip", "IP"],
  ["php", "PHP"],
  ["4ps", "4Ps"],
  ["ofw", "OFW"],
  ["phd", "PhD"],
]);
const TITLE_CONNECTORS = new Set([
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function analyticsLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu, (word, offset: number) => {
      const lower = word.toLowerCase();
      return (
        ANALYTICS_ACRONYMS.get(lower) ??
        (offset > 0 && TITLE_CONNECTORS.has(lower)
          ? lower
          : lower.charAt(0).toUpperCase() + lower.slice(1))
      );
    });
}
