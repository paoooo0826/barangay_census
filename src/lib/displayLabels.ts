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
  if (value === "FHONA")
    return "Former HUKBNP Members and their Descendants (FHONA)";
  return value ?? "";
}
