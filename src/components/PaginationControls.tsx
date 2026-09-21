import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function pageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function pageSlice<T>(rows: T[], page: number, pageSize: number) {
  const safePage = Math.min(
    Math.max(1, page),
    pageCount(rows.length, pageSize),
  );
  return rows.slice((safePage - 1) * pageSize, safePage * pageSize);
}

export default function PaginationControls({
  page,
  totalItems,
  pageSize,
  onPageChange,
}: Props) {
  const totalPages = pageCount(totalItems, pageSize);
  if (totalItems <= pageSize) return null;
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => start + index,
  );
  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex flex-wrap items-center justify-center gap-2"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft size={16} />
        Previous
      </button>
      {pages.map((number) => (
        <button
          type="button"
          key={number}
          aria-current={number === page ? "page" : undefined}
          onClick={() => onPageChange(number)}
          className={`min-w-10 rounded-lg px-3 py-2 text-sm font-bold ${number === page ? "bg-blue-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-blue-50"}`}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
