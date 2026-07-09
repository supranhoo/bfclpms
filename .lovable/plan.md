
# Are all forms linked to the scoring logic? — Audit + Fix Plan

## Short answer

**No.** I ran the audit across every Annual Review template and only **2 of 8** distinct System KPI slot names successfully resolve to the KPI Library at runtime. The other 6 silently fall into the legacy "raw = pre-scaled points" branch — the same bug you already saw on LTI, just hiding on other KPIs. **Every W-template is affected.**

## Audit results (live DB, this project)

- 40 templates, **268 System KPI slots**, of which 266 are scorable (2 are `carry_kra`).
- **266 / 266 scorable slots have no `scoring_rules` stored on the template** (all rely on runtime hydration from the KPI Library).
- **38 of 40 templates** contain at least one slot that the current hydrator cannot resolve.
- Distinct slot names in templates vs. library match status:

  | Template slot name (as stored) | Occurrences | Library match today | Root cause of mismatch |
  |---|---|---|---|
  | `Lost Time Injury (LTI) Rate` | 35 | ✅ matched | — |
  | `Annual Production Target Vs Actual` | 30 | ✅ matched (case-insensitive) | — |
  | `Short Time Injury(STI) Rate` | 35 | ❌ | missing space before `(` |
  | `Departmental Status of 5S in AY 25-26   ` | 38 | ❌ | extra "in AY 25-26" suffix + trailing spaces |
  | `Traiining Attended in AY 25-26  ` | 38 | ❌ | typo ("Traiining") + AY suffix; library name is "Trainings Attended" |
  | `Unsafe Act Unsafe Condition Near Miss - Reported by self` | 37 | ❌ | library uses `/` separators and em-dash |
  | `Fugitive PM10/AQI Non Compliance days` | 33 | ❌ | library uses spaces around `/` and hyphenated "Non-Compliance" |
  | `Annual Maintenance Preventive Maintenance Target vs. Actual` | 20 | ❌ | duplicated word "Maintenance" + period after "vs" |

- Additional data-quality defect in the library itself: `Lost Time Injury (LTI) Rate` and `Short Time Injury (STI) Rate` have a **malformed worst band** — `threshold: {gt: 4}` (object) instead of a number. The current `pickBand` accidentally still returns the worst band by falling through the loop, but the data is invalid and any future refactor of `pickBand` would break it.

**Concrete impact for your ongoing upload**: for LTI = 0/3 the fix I shipped last turn works. But for the same file, **STI, 5S, Fugitive PM10/AQI, Unsafe Act/NM, Trainings, PM Target** are still being scored with the inverted / clamped legacy math — for every W-template employee in the cycle.

## Assumptions

- Slot names must not be renamed post-hoc on live templates (would break historical scores). We link by adding a new stable field, not by rewriting names.
- The KPI Library (`annual_review_system_kpis`) is the SSOT for scoring_rules.
- Nobody is authoring templates by hand-editing JSON right now; the Template Editor and factory are the only writers we need to teach the new field.

## Risk & Impact Report

- **Data impact**: additive only. New optional `library_key` on each template `system_scores[]` slot; no column adds, no destructive updates to `annual_review_instances`. Existing `system_scores` values remain frozen (POLICY §88 immutability preserved).
- **Workflow impact**: none for finalized/approved cycles. For open cycles, dry-run scores flip to the correct values on next bulk upload — which is the intended outcome.
- **UI/UX impact**: (1) new "Scoring health" strip in the Bulk Data Upload dialog and Template Editor showing "X/Y slots linked to library"; (2) unmatched slots get a red "Unlinked" badge in the Template Editor with a "Link to library" dropdown. Nothing else moves visually.
- **Regression risk**: medium — alias/matching changes could over-match. Mitigation: deterministic explicit alias map for the 6 known drift cases, plus a `library_key` that takes precedence over name matching once set. Fuzzy matching only used as a *suggestion* in the Template Editor, never at runtime.
- **Scalability**: audit query and hydration are O(templates × slots) with a single library fetch (<50 rows). No new N+1. Bulk upload path unchanged in complexity.

**Mitigation plan**: ship behind additive schema only; runtime hydration prefers `library_key` when present, falls back to alias-normalized name match, falls back to today's exact-normalized match, and finally logs an unresolved slot to the health strip instead of silently going to legacy math.

## Rollback strategy

- All changes are additive (new JSON field, new alias table, new dialog panel). Revert = re-deploy previous commit. No destructive SQL; the malformed-band repair is idempotent and reversible from a one-row backup snapshot captured in the same migration.

## Step-by-step plan

1. **Stable link key** — extend `TemplateSystemScore` with optional `library_key: string`. Template factory + Template Editor write it whenever a slot is created/picked from the library. → *Verify*: new templates persist `library_key`; existing templates unchanged.
2. **One-time backfill** for existing 40 templates using the explicit alias map below. Written as a reversible migration that only sets `library_key` where it's currently null and the alias is unambiguous. → *Verify*: DB audit query (same as above) shows `unmatched = 0` after migration.
3. **Alias map** (`src/lib/annualReview/systemKpiAliases.ts`) — deterministic, keyed by normalized slot name → library `key`. Covers today's 6 known drifts; extensible.
4. **Harden `hydrateSystemScoringRules`** in `src/services/annualReview/cycleBulkDataUpload.ts`:
   - resolve order: `slot.library_key` → alias map → today's normalized-name match → unresolved.
   - unresolved slots are collected and returned in the plan (not silently dropped to legacy math). Bulk upload calls `scoreFromRaw(raw, null, weight)` **only** when the slot is explicitly manual/legacy — never as a silent fallback for unresolved library-linked slots.
5. **Library data-quality repair** — one migration to normalize `annual_review_system_kpis.scoring_rules` worst-band thresholds to numeric sentinels (`999` for lower_better, `-1` for higher_better), matching the pattern already used by 5S/Trainings/etc. Includes a `okv_migration_history` backup row for rollback.
6. **Bulk Upload dialog health strip** — before the download/dry-run buttons show a compact status: `✅ 8/8 System KPIs linked` (green) or `⚠ 6/8 linked — 2 unresolved: STI Rate, 5S` (amber) with a link that opens the Template Editor filtered to unresolved slots. Blocks Commit only if the specific column being uploaded has an unresolved slot for at least one target instance.
7. **Template Editor "Link to library" affordance** — for any slot without `library_key`, show a small dropdown of library KPIs with the top-3 fuzzy suggestions highlighted, plus "not a library KPI (manual scoring)" opt-out. Writing this field is the only way to clear the amber warning.
8. **Tests** — add coverage for each of the 6 drift cases and the health strip's resolved/unresolved counts.
9. **DOCUMENTATION.md + POLICY.md** — record the new `library_key` field, the alias resolution order, and the "no silent legacy fallback for unresolved library slots" rule under `§AR-SYSTEM-KPI-RAW-INPUT`. Bump version history.

## Technical details

- **Files touched (est.)**:
  - `src/types/annualReview.ts` — add `library_key?: string` to `TemplateSystemScore`.
  - `src/lib/annualReview/systemKpiAliases.ts` — new file, ~30 lines.
  - `src/services/annualReview/cycleBulkDataUpload.ts` — extend `hydrateSystemScoringRules`; surface `unresolvedSlots` on `CycleBulkPlan`.
  - `src/components/annual-review/CycleBulkDataUploadDialog.tsx` — health strip.
  - `src/components/annual-review/TemplateEditorDialog.tsx` — "Link to library" per slot.
  - `src/services/annualReview/templateFactory.ts` + `templateFactoryBulk.ts` — write `library_key` on create.
  - Two Supabase migrations (backfill `library_key`; repair LTI/STI worst-band).
- **Alias table (initial contents)**:

  ```text
  short time injury(sti) rate                                     → sti_rate
  departmental status of 5s in ay 25-26                           → dept_5s
  traiining attended in ay 25-26                                  → trainings_attended
  unsafe act unsafe condition near miss - reported by self        → unsafe_act_near_miss
  fugitive pm10/aqi non compliance days                           → fugitive_pm10_aqi
  annual maintenance preventive maintenance target vs. actual     → annual_pm_target_vs_actual
  ```
  (Library `key` values will be confirmed from `annual_review_system_kpis.key` at implementation time; the above are illustrative.)
- **Ordering guarantee**: resolver is pure/deterministic and unit-tested; no locale-dependent behavior.

## Tests

- `systemKpiAliases.test.ts` — every alias resolves; unknown names return null; case/whitespace normalization.
- `hydrateSystemScoringRules.test.ts` — 3 paths (library_key hit / alias hit / exact-name hit / unresolved).
- Extend `cycleBulkDataUploadLtiHydration.test.ts` with STI, 5S, Fugitive PM10, Unsafe Act, Trainings, PM Target — each locking correct rating/points for a representative raw value.
- Dialog snapshot: green vs amber health strip.

## Not applicable

- Pagination / large-dataset limits — audit set is <300 rows.
- Backup — additive JSON field, covered by existing `annual_review_templates` backup coverage.
- Offline resilience — feature is admin-only, always online.

## Version log entry (to add on implement)

`v2.66.91 — Annual Review System KPI slots gain stable library_key link. Runtime scoring no longer silently degrades to legacy math for library-linked slots. Bulk Data Upload dialog surfaces unresolved-slot health. Library worst-band thresholds for LTI/STI normalized to numeric sentinels.`
