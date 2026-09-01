/**
 * ADR-334 — Opt-in legacy display-name rename from the group definition editor.
 *
 * Editing a group rewrites the structured fields (Title / Description / Formula /
 * Scoring logic) everywhere, but the legacy `kpi_name` (and its KRA name) is the
 * join key used by Org KPI Data Entry, the KPI Status Tracker and Excel exports.
 * ADR-269 deliberately leaves it alone, which is why those surfaces kept showing
 * the old wording.
 *
 * This module builds — and validates — the payload for the existing reversible
 * rename engine (`correct_kpis_range_dry_run` / `correct_kpis_range`, ADR-330),
 * so the rename is an explicit, previewed, forward-only, undoable step.
 *
 * POLICY §KPI-STANDARDIZATION / §CONSOLE-TEXT-ONLY-STANDARDISATION:
 *  - opt-in only (never implied by a definition edit),
 *  - forward-only (nothing before May 2026),
 *  - text + definition binding only — no targets, weightages, scores or status.
 */
import {
  CORRECTION_FLOOR, MONTH_NAMES, periodKey, type RangeArgs,
} from '@/hooks/useKpiRangeCorrection';

export interface LegacyRenameState {
  enabled: boolean;
  newKra: string;
  newKpi: string;
  fromPeriod: string;
  fromYear: number;
  toPeriod: string;
  toYear: number;
}

export interface RenameAnchor {
  categoryId: string;
  oldKra: string;
  oldKpi: string;
  period: string;
  year: number;
}

/** Fiscal cycle runs July–June (POLICY §fiscal-year-cycle). */
export function fiscalEnd(period: string, year: number): { period: string; year: number } {
  const m = MONTH_NAMES.indexOf(period as (typeof MONTH_NAMES)[number]) + 1;
  return { period: 'June', year: m >= 7 ? year + 1 : year };
}

/**
 * Default range: the console month through the end of its fiscal year, never
 * reaching below the forward-only floor.
 */
export function defaultRenameRange(period: string, year: number) {
  const start = periodKey(period, year) < CORRECTION_FLOOR
    ? { period: 'May', year: 2026 }
    : { period, year };
  const end = fiscalEnd(start.period, start.year);
  return {
    fromPeriod: start.period,
    fromYear: start.year,
    toPeriod: periodKey(end.period, end.year) < periodKey(start.period, start.year)
      ? start.period
      : end.period,
    toYear: periodKey(end.period, end.year) < periodKey(start.period, start.year)
      ? start.year
      : end.year,
  };
}

export function initialRenameState(anchor: RenameAnchor, seedKpiTitle?: string | null): LegacyRenameState {
  return {
    enabled: false,
    newKra: anchor.oldKra ?? '',
    newKpi: (seedKpiTitle ?? '').trim() || (anchor.oldKpi ?? ''),
    ...defaultRenameRange(anchor.period, anchor.year),
  };
}

/** Human-readable blocker, or null when the rename can run. */
export function validateRename(state: LegacyRenameState): string | null {
  if (!state.enabled) return null;
  if (!state.newKra.trim() || !state.newKpi.trim()) {
    return 'Enter both the new KRA name and the new KPI name.';
  }
  const from = periodKey(state.fromPeriod, state.fromYear);
  const to = periodKey(state.toPeriod, state.toYear);
  if (from < CORRECTION_FLOOR) {
    return 'Months before May 2026 are frozen and cannot be renamed.';
  }
  if (to < from) return 'The end month must not be before the start month.';
  return null;
}

/** True when the rename would write nothing (same names). */
export function isRenameNoop(state: LegacyRenameState, anchor: RenameAnchor): boolean {
  return state.newKra.trim() === (anchor.oldKra ?? '').trim()
    && state.newKpi.trim() === (anchor.oldKpi ?? '').trim();
}

export function buildRenameArgs(
  state: LegacyRenameState,
  anchor: RenameAnchor,
  definitionId: string | null,
): (RangeArgs & { newKra: string; newKpi: string; definitionId: string | null }) | null {
  if (!state.enabled || validateRename(state) || isRenameNoop(state, anchor)) return null;
  return {
    categoryId: anchor.categoryId,
    oldKra: anchor.oldKra,
    oldKpi: anchor.oldKpi,
    newKra: state.newKra.trim(),
    newKpi: state.newKpi.trim(),
    definitionId,
    fromPeriod: state.fromPeriod,
    fromYear: state.fromYear,
    toPeriod: state.toPeriod,
    toYear: state.toYear,
  };
}

/** Month options offered by the range pickers, floor-aware. */
export function renameMonthOptions(years: number[]) {
  const out: { value: string; period: string; year: number; label: string }[] = [];
  for (const y of years) {
    for (const p of MONTH_NAMES) {
      if (periodKey(p, y) < CORRECTION_FLOOR) continue;
      out.push({ value: `${p}|${y}`, period: p, year: y, label: `${p.slice(0, 3)} ${y}` });
    }
  }
  return out;
}
