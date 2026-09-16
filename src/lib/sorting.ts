export type SortDirection = 'asc' | 'desc';

const collator = new Intl.Collator('en-PH', { sensitivity: 'base', numeric: true });

export function compareValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
  direction: SortDirection = 'asc',
) {
  const leftMissing = left == null || left === '';
  const rightMissing = right == null || right === '';
  if (leftMissing || rightMissing) return Number(leftMissing) - Number(rightMissing);
  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : collator.compare(String(left), String(right));
  return direction === 'asc' ? result : -result;
}
