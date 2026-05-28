/**
 * Edit window for user-authored comments (observations + replies).
 * Mirrors the 24h rule enforced server-side via RLS UPDATE policies.
 */
export const OBSERVATION_EDIT_WINDOW_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MIN = 60 * 1000;

export function isWithinEditWindow(createdAt: string | Date | null | undefined, nowMs: number = Date.now()): boolean {
  if (!createdAt) return false;
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt.getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t < OBSERVATION_EDIT_WINDOW_HOURS * MS_PER_HOUR;
}

export function remainingEditMinutes(createdAt: string | Date | null | undefined, nowMs: number = Date.now()): number {
  if (!createdAt) return 0;
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : createdAt.getTime();
  if (Number.isNaN(t)) return 0;
  const remainingMs = OBSERVATION_EDIT_WINDOW_HOURS * MS_PER_HOUR - (nowMs - t);
  return Math.max(0, Math.ceil(remainingMs / MS_PER_MIN));
}

export function formatRemainingEditWindow(createdAt: string | Date | null | undefined, nowMs: number = Date.now()): string {
  const mins = remainingEditMinutes(createdAt, nowMs);
  if (mins <= 0) return 'expired';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m left`;
  return `${h}h ${m}m left`;
}