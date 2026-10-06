import { BOARDING_OPTIONS, type BoardingFormData } from "../lib/boarding";
import type { BoardingStatus } from "../types/database";

export default function BoardingFormFields({
  data,
  errors,
  onChange,
  onStatusChange,
}: {
  data: BoardingFormData;
  errors: Partial<Record<keyof BoardingFormData, string>>;
  onChange: (field: keyof BoardingFormData, value: string) => void;
  onStatusChange: (status: BoardingStatus) => void;
}) {
  const fields: Array<{
    field: keyof BoardingFormData;
    label: string;
    type?: string;
    required?: boolean;
    maxLength?: number;
  }> =
    data.boarding_status === "boarder"
      ? [
          {
            field: "boarding_house_name",
            label: "Name of Boarding House / Residence",
            required: true,
            maxLength: 150,
          },
          {
            field: "boarding_landlord_name",
            label: "Name of Landlord/Landlady",
            required: true,
            maxLength: 150,
          },
          {
            field: "boarding_house_address",
            label: "Boarding House Address",
            required: true,
            maxLength: 500,
          },
          {
            field: "boarding_start_date",
            label: "Date Started Staying",
            type: "date",
            required: true,
          },
          {
            field: "monthly_rent",
            label: "Boarding Monthly Rent (PHP, optional)",
            type: "number",
          },
        ]
      : data.boarding_status === "landlord"
        ? [
            {
              field: "boarding_house_name",
              label: "Name of Boarding House",
              required: true,
              maxLength: 150,
            },
            {
              field: "boarding_house_address",
              label: "Boarding House Address",
              required: true,
              maxLength: 500,
            },
            {
              field: "boarding_tenant_count",
              label: "Number of Boarders/Tenants",
              type: "number",
              required: true,
            },
            {
              field: "boarding_contact",
              label: "Boarding House Contact Information (optional)",
              maxLength: 150,
            },
          ]
        : [];
  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <fieldset
        data-field="boarding_status"
        aria-invalid={Boolean(errors.boarding_status)}
      >
        <legend className="label">
          Boarding Status <span className="text-red-600">*</span>
        </legend>
        <p className="mb-3 text-sm text-slate-500">
          Are you currently connected to a boarding house?
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {BOARDING_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-11 items-center gap-3 rounded-xl border bg-white p-4 ${data.boarding_status === option.value ? "border-pine-500 bg-pine-50" : "border-slate-200"}`}
            >
              <input
                type="radio"
                name="boarding_status"
                value={option.value}
                checked={data.boarding_status === option.value}
                onChange={() => onStatusChange(option.value)}
              />
              <span className="text-sm font-semibold">{option.label}</span>
            </label>
          ))}
        </div>
        {errors.boarding_status && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {errors.boarding_status}
          </p>
        )}
      </fieldset>
      {fields.length > 0 && (
        <div
          key={data.boarding_status}
          className="mt-5 grid gap-4 rounded-2xl bg-pine-50/60 p-4 sm:grid-cols-2 sm:p-5"
        >
          {fields.map(
            ({ field, label, type = "text", required, maxLength }) => (
              <div key={field} className="min-w-0">
                <label htmlFor={`census-${field}`} className="label">
                  {label} {required && <span className="text-red-600">*</span>}
                </label>
                <input
                  id={`census-${field}`}
                  data-field={field}
                  type={type}
                  maxLength={maxLength}
                  min={type === "number" ? "0" : undefined}
                  max={field === "boarding_tenant_count" ? "100000" : undefined}
                  step={
                    type === "number"
                      ? field === "monthly_rent"
                        ? "0.01"
                        : "1"
                      : undefined
                  }
                  value={data[field]}
                  onChange={(event) => onChange(field, event.target.value)}
                  aria-required={Boolean(required)}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={
                    errors[field] ? `census-${field}-error` : undefined
                  }
                  className={`input mt-1 ${errors[field] ? "border-red-500 bg-red-50" : ""}`}
                />
                {errors[field] && (
                  <p
                    id={`census-${field}-error`}
                    className="mt-2 text-xs font-semibold text-red-700"
                  >
                    {errors[field]}
                  </p>
                )}
              </div>
            ),
          )}
          {data.boarding_status === "landlord" && (
            <p className="text-xs leading-5 text-slate-600 sm:col-span-2">
              This records your reported boarding information. The barangay must
              assign your boarding house before you can manage its boarders.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
