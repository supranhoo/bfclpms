## What you're seeing

Today the Template Factory only reads **one** criteria list per archetype: `annual_review_template_archetypes.default_criteria`. That's why every generated template for A/B/C/D shows the same qualitative questions regardless of Department, Sub-unit or Grade — there is no override layer for questions (there is one for KPI weights, but not for criteria).

Your uploaded workbook already proves the real requirement: 5 sheets — generic Blue-Collar (W), generic Managerial (M), M-no-Env, and two department-specific Workmen sets (HK/Pol/Dust/Hort, and Admin/Temple/Travel/WB/Sec). So you need **common questions + variant sets per Dept / Sub-unit / Grade bucket**, exactly like the system-KPI weight cascade.

## Proposed model — mirror the System KPI pattern for questions

Introduce a two-table "Criteria Library + Criteria Matrix", so a template's final criteria list is *composed* at factory time from the most-specific match, exactly like `resolveWeight()` does today.

```text
annual_review_criteria_library         (the "questions" catalog)
  id, key, label_en, label_hi, max_score, scoring_bands_json,
  is_common (bool), is_active, sort_order

annual_review_criteria_assignments     (the "who gets this question" matrix)
  id, criterion_id,
  archetype_code   NULL = any,
  grade_bucket     NULL = any (M/W/T/other),
  department_id    NULL = any,
  sub_unit_id      NULL = any,
  weight_pct       (per-criterion weight in that context),
  is_enabled       (bool — lets you *remove* a common question for one dept)
```

Resolution rule (same specificity score you already use):
`sub_unit (4) + dept (2) + grade (1) + archetype (0.5)` — most specific row wins; `NULL` = wildcard. A row with `is_enabled=false` at higher specificity **suppresses** an inherited common question — that's how "Env" is dropped from "M no Env".

`is_common = true` rows in the library are the baseline pool; they only appear on a template if at least one assignment row (even a full-wildcard one) enables them for that context.

## Factory changes

1. `templateFactoryBulk.rebuildFactoryTemplatesForCycle` and the preview builder stop reading `archetype.default_criteria` as the final list. Instead they call a new `resolveCriteria(assignments, library, {archetype, grade, dept, subUnit})` — same shape as `resolveWeight`.
2. `sections.criteria` on the generated template is the resolved, ordered, deduped list with per-context weights.
3. Preview table gets two extra columns: **Criteria count** (already there) + **Missing common?** flag when a required-common question was suppressed everywhere for that cell.
4. `archetype.default_criteria` becomes a *seed only* — used the first time you populate the library, then locked read-only in the Archetypes editor with a "Managed in Criteria Library" note.

## Admin surfaces

- **Admin → Criteria Library** (new): CRUD list, bilingual EN/HI, scoring bands editor, `is_common` toggle. Bulk XLSX import that accepts the exact sheet layout of your uploaded workbook (Criteria / Rating description / Wt%). Bilingual XLSX export for review.
- **Admin → Criteria Matrix** (new): sparse-cell editor identical in feel to the Weight Matrix — pick criterion, then set enabled + weight for any (Archetype × Grade × Dept × Sub-unit) cell. `NULL` columns render as wildcards.
- **Admin → Template Factory** preview: for any (Dept × Sub-unit × Archetype × Grade) cell, "Preview criteria" popover shows the resolved question list with which row won each cell, so admins can debug why a question did/didn't appear.

## Import mapping for the uploaded file

- Sheet **Generic - M** → library rows tagged `is_common=true`, assigned at `(archetype=B, grade=M, dept=*, sub_unit=*)`.
- Sheet **Generic - M no Env** → same library rows minus "Environment"; achieved by keeping the common rows and adding an override row `(grade=M, dept=<no-env depts>, criterion=Environment, is_enabled=false)`.
- Sheet **Generic - Blue Collar** → common set at `(archetype=C, grade=W, *, *)`.
- Sheet **HK/Pol/Dust/Hort - W** → dept-specific overrides at `(grade=W, department_id IN (…), sub_unit=*)`, adds dept-only questions and can suppress inapplicable common ones.
- Sheet **Admin/Temple/TO/Travel/WB/Sec - W** → same pattern for the second dept cluster.

## Risk & Impact

- **Data**: two new tables + one seed migration; no destructive change to `annual_review_template_archetypes`. Existing generated templates keep working until you run "Re-apply to existing templates".
- **Workflow**: `rebuildFactoryTemplatesForCycle` becomes the single re-application path — already idempotent.
- **UI**: two new admin pages under Annual Review Admin. Factory page gains one column and one preview popover.
- **Backward compat**: if `criteria_library` is empty, resolver falls back to `archetype.default_criteria` so nothing breaks day-1.
- **Rollback**: drop the two new tables + revert the resolver call; archetype seed is untouched.

## Deliverables (in this order)

1. Migration: `annual_review_criteria_library`, `annual_review_criteria_assignments` with GRANTs, RLS, `updated_at` triggers.
2. `src/services/annualReview/criteriaLibrary.ts` — CRUD + `resolveCriteria` + specificity scorer + unit tests (mirrors `templateFactory.test.ts`).
3. Factory integration: `templateFactory.buildPlan` and `templateFactoryBulk.rebuildFactoryTemplatesForCycle` use `resolveCriteria`; keep archetype fallback.
4. Admin pages: `CriteriaLibraryPanel`, `CriteriaMatrixPanel`, routed under `/annual-review/admin/factory`.
5. XLSX import matching your uploaded workbook layout (bilingual, per-sheet grade/dept mapping form) + bilingual export.
6. Docs: update `docs/specs/annual-review-template-factory.md` "Data model" and add a "Criteria resolver" section; add "Criteria Library" bullet to `mem://features/annual-review/overview` index.

## Open questions before I start

1. **Weight semantics** — should per-criterion `weight_pct` sum to 100 per template (validated at commit), or is it a raw multiplier the reviewer sees?
2. **Grade granularity** — is the current `M / W / T / other` bucket enough, or do you need actual `pms_grades.code` targeting (e.g. `M4` vs `M1`)?
3. **Suppression UI** — do you want an explicit "Remove this common question for this cell" toggle in the matrix, or should setting `weight_pct = 0` mean "hide"?
4. **Department clusters** — the two W-sheets group depts (HK/Pol/Dust/Hort; Admin/Temple/…). Should I introduce a lightweight `department_group` table, or just repeat the assignment row per department during import?
