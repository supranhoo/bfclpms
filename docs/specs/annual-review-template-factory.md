# Annual Review — Bulk Template Factory (AY 2025–26)

Status: Shipped (P1–P7). Owner: Annual Review admin surface.

## Purpose

Generate and maintain the AY 2025–26 review templates at scale (per Department × Sub-unit × Archetype × Grade bucket) without hand-authoring each one. Reruns are idempotent so weight-matrix or archetype edits can be re-applied to already-generated templates.

## Data model

| Object | Table | Role |
| --- | --- | --- |
| System KPI library | `annual_review_system_kpis` | Reusable KPI definitions (bilingual + scoring bands). |
| Weight matrix | `annual_review_system_kpi_weights` | (KPI × Dept × Sub-unit × Grade) weight cells; `NULL` = wildcard. |
| Archetypes | `annual_review_template_archetypes` | A/B/C/D families with default stage weights, qualitative criteria, enabled stages, display mode. |
| Assignment rules | `annual_review_assignment_rules` | Adds `archetype_code`, `grade_bucket`, `requires_kra_in_ay`, `min_kra_months_in_ay`. |
| Templates | `annual_review_templates` | Generated rows carry `sections.factory_key` for idempotency. |
| Criteria library | `annual_review_criteria_library` | Reusable bilingual qualitative questions with scoring bands and `is_common` flag. |
| Criteria matrix | `annual_review_criteria_assignments` | (Criterion × Archetype × Grade-bucket × Grade-code × Dept × Sub-unit) rows that decide which questions land on which template and with what weight. `is_enabled=false` explicitly suppresses a common question for the cell. |

## Archetype policy

- **A** — KRA-based (employee has ≥ `min_kra_months_in_ay` KRA-months in the AY window July Y → June Y+1).
- **B** — Managerial, no KRA (grade bucket `M`).
- **C** — Workmen, no KRA (grade bucket `W`).
- **D** — Trainees / other (grade bucket `T` or `other`).

Resolution: `src/services/annualReview/archetypeResolver.ts` → `resolveArchetypeForEmployee()`. Grade bucket derives from `pms_grades.family_bucket` with a code-prefix fallback (`bucketFromGradeCode`).

## Weight resolver

`resolveWeight(rows, kpiId, deptId, subUnitId, gradeBucket)` picks the most-specific cell using score `sub-unit (4) + dept (2) + grade (1)`. A `NULL` column is a wildcard that only wins when no more-specific row applies. A `weight_pct = 0` upsert deletes the cell so wildcard fallbacks resume.

## Factory idempotency key

Every generated template carries `sections.factory_key`:

```json
{
  "cycle_id": "…",
  "department_id": "…",
  "sub_unit_id": "… | null",
  "archetype_code": "A|B|C|D",
  "grade_bucket": "M|W|T|other"
}
```

`listFactoryTemplates(cycleId)` filters by `sections->factory_key->>cycle_id`. Preview matches on the full key; commit updates existing rows and inserts otherwise.

## UI surfaces

- **Admin → System KPIs** — library CRUD + bilingual XLSX export.
- **Admin → Archetypes** — A/B/C/D editor + XLSX export.
- **Admin → Weight Matrix** — sparse cell editor (P2).
- **Admin → Template Factory** (`/annual-review/admin/factory`) — cycle picker, multi-select dept/sub-unit, archetype × grade matrix, dry-run preview (create/update, weight total, missing-criteria flag), commit, and **Re-apply to existing templates** (bulk rebuild via `rebuildFactoryTemplatesForCycle`).

## Re-apply flow

`rebuildFactoryTemplatesForCycle(cycleId)` iterates every factory-generated template for the cycle, recomputes `system_scores` from the current KPI library + weight matrix, refreshes archetype-owned fields (`display_mode`, `criteria`, default `stage_weights` when not manually overridden), and preserves non-factory metadata. Safe to run repeatedly.

## XLSX exports

`src/lib/annualReview/factoryWorkbook.ts` — bilingual (EN/HI) workbooks for the KPI library (rows + scoring bands) and archetypes (summary + criteria). XLSX **import** is intentionally deferred; the datasets are small enough that admin CRUD suffices.

## Tests

- `src/services/annualReview/templateFactory.test.ts` — weight resolver specificity, scoring-band parsing, grade-bucket inference, AY bounds.
- `src/services/annualReview/carryKraScore.test.ts` — carry-forward score picking (existing).

## Adopting an existing template into the factory

A pre-existing template (authored before the factory) can be brought under factory management by patching its `sections` to include a valid `factory_key` matching the intended cycle × dept × sub-unit × archetype × grade bucket. On the next `rebuildFactoryTemplatesForCycle` run the row is picked up and updated in-place — no duplicate is created.

## Version history

- 2026-07-05 — Shipped P1–P7 (system KPI library, weight matrix, archetypes, assignment-rule extension, factory UI, XLSX export, bulk re-apply, docs + tests).
- 2026-07-05 — Shipped Criteria Library + Matrix. Templates now compose qualitative questions per cell via `resolveCriteria`, with `is_enabled=false` suppression and a commit-time rule that per-template criterion weights must sum to 100 (±0.01). Archetype `default_criteria` remains the day-0 fallback when no library rows cover a cell.

## Criteria resolver

`resolveCriteria(library, assignments, target)` in `src/services/annualReview/criteriaLibrary.ts` picks, for each active library row, the single most-specific matching assignment cell using this ladder:

```
sub_unit  = 16
dept      =  8
grade_code =  4   (exact code, e.g. "M4")
grade_bucket =  2 (family bucket M/W/T/other)
archetype =  1
```

`NULL` in a column = wildcard. A criterion is included only if at least one row matches; if the winning row has `is_enabled = false`, the criterion is suppressed for that cell (used to drop e.g. "Environment" from a "M no Env" department).

`validateResolvedWeights(resolved)` enforces `sum(weight_pct) === 100` (±0.01) at factory commit time. `commitFactoryRun` and `rebuildFactoryTemplatesForCycle` block any template where `criteriaSource === 'library'` and the sum fails, surfacing the error in the preview table's "Crit Wt %" column.

Templates that fall back to the archetype seed (`criteriaSource === 'archetype'`) are exempt from the 100% rule — the seed carries no weights.
