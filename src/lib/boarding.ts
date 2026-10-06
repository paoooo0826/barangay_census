import type { BoardingStatus, Resident } from "../types/database";

export const BOARDING_OPTIONS: Array<{ value: BoardingStatus; label: string }> =
  [
    { value: "boarder", label: "Boarder" },
    { value: "landlord", label: "Landlord/Landlady" },
    { value: "neither", label: "Neither" },
  ];

export interface BoardingFormData {
  boarding_status: BoardingStatus;
  boarding_house_name: string;
  boarding_house_address: string;
  boarding_landlord_name: string;
  boarding_start_date: string;
  boarding_tenant_count: string;
  boarding_contact: string;
  monthly_rent: string;
}

export const EMPTY_BOARDING_FIELDS = {
  boarding_house_name: "",
  boarding_house_address: "",
  boarding_landlord_name: "",
  boarding_start_date: "",
  boarding_tenant_count: "",
  boarding_contact: "",
};

export function validateBoarding(
  data: BoardingFormData,
  birthDate: string,
  today: string,
) {
  const errors: Partial<Record<keyof BoardingFormData, string>> = {};
  if (
    !BOARDING_OPTIONS.some((option) => option.value === data.boarding_status)
  ) {
    errors.boarding_status = "Choose a boarding status.";
    return errors;
  }
  if (data.boarding_status === "neither") return errors;
  if (
    data.boarding_house_name.trim().length < 2 ||
    data.boarding_house_name.trim().length > 150
  )
    errors.boarding_house_name =
      "Enter a boarding house name with 2 to 150 characters.";
  if (
    data.boarding_house_address.trim().length < 3 ||
    data.boarding_house_address.trim().length > 500
  )
    errors.boarding_house_address =
      "Enter an address with 3 to 500 characters.";
  if (data.boarding_status === "boarder") {
    if (
      data.boarding_landlord_name.trim().length < 2 ||
      data.boarding_landlord_name.trim().length > 150
    )
      errors.boarding_landlord_name =
        "Enter the landlord/landlady name with 2 to 150 characters.";
    const parsed = new Date(`${data.boarding_start_date}T00:00:00Z`);
    if (
      !data.boarding_start_date ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== data.boarding_start_date ||
      data.boarding_start_date > today ||
      (birthDate && data.boarding_start_date < birthDate)
    )
      errors.boarding_start_date =
        "Enter a valid stay start date between your birth date and today.";
    if (
      data.monthly_rent.trim() &&
      (!Number.isFinite(Number(data.monthly_rent)) ||
        Number(data.monthly_rent) < 0 ||
        Number(data.monthly_rent) > 99999999.99)
    )
      errors.monthly_rent =
        "Enter a valid monthly rent of zero or more, or leave it empty.";
  } else {
    const count = Number(data.boarding_tenant_count);
    if (
      !data.boarding_tenant_count.trim() ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 100000
    )
      errors.boarding_tenant_count =
        "Enter a whole number of boarders/tenants from 0 to 100,000.";
    if (data.boarding_contact.trim().length > 150)
      errors.boarding_contact =
        "Use no more than 150 characters for contact information.";
  }
  return errors;
}

export function boardingStatusLabel(value?: string | null) {
  return (
    BOARDING_OPTIONS.find((option) => option.value === value)?.label ??
    "Neither"
  );
}

export function canAccessBoarding(value?: string | null) {
  return value === "boarder" || value === "landlord";
}

export function boardingRows(resident: Resident): Array<[string, unknown]> {
  const rows: Array<[string, unknown]> = [
    ["Boarding Status", boardingStatusLabel(resident.boarding_status)],
  ];
  if (!canAccessBoarding(resident.boarding_status)) return rows;
  rows.push(
    ["Boarding House", resident.boarding_house_name],
    ["Boarding House Address", resident.boarding_house_address],
  );
  if (resident.boarding_status === "boarder") {
    rows.push(
      ["Landlord/Landlady", resident.boarding_landlord_name],
      ["Date Started Staying", resident.boarding_start_date],
    );
    if (resident.monthly_rent != null)
      rows.push([
        "Boarding Monthly Rent",
        `₱${Number(resident.monthly_rent).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
      ]);
  } else {
    rows.push(
      ["Number of Boarders/Tenants (Reported)", resident.boarding_tenant_count],
      ["Boarding House Contact", resident.boarding_contact],
    );
  }
  return rows;
}
