/**
 * Deterministic alias map that binds a template `system_scores[]` slot name
 * to its canonical `annual_review_system_kpis.key`.
 *
 * Historical templates were authored before the Library existed and their slot
 * names drifted from the Library `name_en` (extra suffixes, typos, punctuation).
 * Runtime scoring MUST link to the Library or it silently falls into the
 * legacy "raw = pre-scaled points" branch — which INVERTS lower-is-better KPIs
 * (e.g. LTI = 0 was scored 0/5, LTI = 3 was scored 5/5).
 *
 * Resolution order in `hydrateSystemScoringRules`:
 *   1. `slot.library_key` (stable, preferred)
 *   2. this alias map, keyed by the normalized slot name
 *   3. exact normalized-name match against `annual_review_system_kpis.name_en`
 *   4. unresolved — surfaced to the Bulk Upload dialog health strip,
 *      NEVER silently fed into the legacy scorer.
 *
 * Keys are lower-cased, whitespace-collapsed, and trimmed. Values are the
 * exact `annual_review_system_kpis.key` column.
 *
 * Adding a new alias: run the audit query in DOCUMENTATION.md
 * (§AR-SYSTEM-KPI-LIBRARY-LINK) to confirm the unresolved slot name, then
 * append a row here. Duplicates or ambiguous mappings will fail
 * `systemKpiAliases.test.ts`.
 */

export type LibraryKey = string;

/** Normalize a slot name for alias lookup: lower + trim + collapse whitespace. */
export function normalizeSlotName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Alias table. Left column = normalized slot name found in live templates.
 * Right column = canonical library key.
 */
export const SYSTEM_KPI_ALIASES: Readonly<Record<string, LibraryKey>> = Object.freeze({
  // ── Exact library-name aliases (idempotent — resolver would find these anyway,
  //    but listing them makes the mapping self-documenting) ────────────
  'lost time injury (lti) rate': 'lti_rate',
  'short time injury (sti) rate': 'sti_rate',
  'departmental status of 5s': 's5',
  'trainings attended': 'training_attended',
  'unsafe act / unsafe condition / near miss — reported by self': 'ua_uc_nm',
  'fugitive pm10 / aqi non-compliance days': 'fugitive_pm10',
  'annual production target vs actual': 'annual_production',
  'annual preventive maintenance target vs actual': 'annual_pm',

  // ── Drift aliases observed in v2.66.90 template audit ──────────────
  'short time injury(sti) rate': 'sti_rate',                                              // missing space before "("
  'departmental status of 5s in ay 25-26': 's5',                                          // AY-suffix + trailing WS (norm handles WS)
  'traiining attended in ay 25-26': 'training_attended',                                  // typo "Traiining" + AY suffix
  'unsafe act unsafe condition near miss - reported by self': 'ua_uc_nm',                 // slashes dropped, em-dash → hyphen
  'fugitive pm10/aqi non compliance days': 'fugitive_pm10',                               // no spaces around "/", "Non Compliance" un-hyphenated, lowercase "days"
  'annual maintenance preventive maintenance target vs. actual': 'annual_pm',             // duplicated word + period after "vs"
});

/**
 * Resolve a slot name to a library key via the alias map, if any.
 * Returns `null` when unknown.
 */
export function resolveLibraryKeyByName(slotName: string): LibraryKey | null {
  return SYSTEM_KPI_ALIASES[normalizeSlotName(slotName)] ?? null;
}