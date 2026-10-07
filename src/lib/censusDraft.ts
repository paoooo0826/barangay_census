import type { Json } from "../types/database";

export const DRAFT_FIELDS = [
  "region",
  "province",
  "city_municipality",
  "barangay",
  "last_name",
  "suffix",
  "first_name",
  "middle_name",
  "birth_date",
  "birth_place",
  "sex",
  "civil_status",
  "religion",
  "residential_address",
  "citizenship",
  "profession_occupation",
  "contact_number",
  "highest_education",
  "education_status",
  "residence_start_date",
  "residence_classification",
  "tenurial_status",
  "monthly_rent",
  "boarding_status",
  "boarding_house_name",
  "boarding_house_address",
  "boarding_landlord_name",
  "boarding_start_date",
  "boarding_tenant_count",
  "boarding_contact",
  "indigenous_group",
  "other_description",
] as const;
export function censusDraftPayload(
  value: Record<string, unknown>,
): Record<string, Json> {
  const result: Record<string, Json> = {};
  for (const field of DRAFT_FIELDS) {
    if (typeof value[field] === "string") result[field] = value[field];
  }
  if (Array.isArray(value.categories))
    result.categories = value.categories.filter(
      (id) => Number.isSafeInteger(id) && id > 0,
    );
  return result;
}
export function sameRecordVersion(a: string | null, b: string | null) {
  // Compare the raw timestamp too: PostgreSQL preserves microseconds that Date loses.
  return a === b;
}
