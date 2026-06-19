/**
 * Pure helpers for the Incentive Data Entry daily grid.
 * Extracted from `ProductionDailyGrid` so they can be unit-tested in isolation.
 */

export interface DailyGridEmployee {
  id: string;
  full_name?: string | null;
  employee_code?: string | null;
  designation?: string | null;
  departments?: { name?: string | null } | null;
}

export interface DailyGridFilters {
  global: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  rateMin: string;
  rateMax: string;
}

export const EMPTY_FILTERS: DailyGridFilters = {
  global: '',
  code: '',
  name: '',
  designation: '',
  department: '',
  rateMin: '',
  rateMax: '',
};

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();
const includes = (haystack: unknown, needle: string) =>
  !needle || norm(haystack).includes(norm(needle));

export function applyDailyGridFilters<T extends DailyGridEmployee>(
  rows: T[],
  filters: DailyGridFilters,
  rateOf: (emp: T) => number,
): T[] {
  const g = norm(filters.global);
  const min = filters.rateMin === '' ? -Infinity : Number(filters.rateMin);
  const max = filters.rateMax === '' ? Infinity : Number(filters.rateMax);
  return rows.filter((r) => {
    const dept = r.departments?.name ?? '';
    if (g) {
      const blob = [r.employee_code, r.full_name, r.designation, dept]
        .map(norm)
        .join(' ');
      if (!blob.includes(g)) return false;
    }
    if (!includes(r.employee_code, filters.code)) return false;
    if (!includes(r.full_name, filters.name)) return false;
    if (!includes(r.designation, filters.designation)) return false;
    if (!includes(dept, filters.department)) return false;
    const rate = rateOf(r);
    if (Number.isFinite(min) && rate < min) return false;
    if (Number.isFinite(max) && rate > max) return false;
    return true;
  });
}

export function paginate<T>(rows: T[], pageIndex: number, pageSize: number): T[] {
  if (pageSize <= 0) return rows;
  const start = Math.max(0, pageIndex) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function hasActiveFilters(filters: DailyGridFilters): boolean {
  return (
    !!filters.global ||
    !!filters.code ||
    !!filters.name ||
    !!filters.designation ||
    !!filters.department ||
    !!filters.rateMin ||
    !!filters.rateMax
  );
}