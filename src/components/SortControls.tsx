import type { SortDirection } from '../lib/sorting';

interface SortControlsProps {
  id: string;
  field: string;
  direction: SortDirection;
  options: readonly { value: string; label: string }[];
  onFieldChange: (field: string) => void;
  onDirectionChange: (direction: SortDirection) => void;
}

export default function SortControls({
  id, field, direction, options, onFieldChange, onDirectionChange,
}: SortControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${id}-field`} className="text-sm font-semibold text-slate-700">Sort by</label>
      <select
        id={`${id}-field`}
        value={field}
        onChange={(event) => onFieldChange(event.target.value)}
        className="h-11 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select
        aria-label={`${id} sort direction`}
        value={direction}
        onChange={(event) => onDirectionChange(event.target.value as SortDirection)}
        className="h-11 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <option value="asc">Ascending (A–Z / lowest first)</option>
        <option value="desc">Descending (Z–A / highest first)</option>
      </select>
    </div>
  );
}
