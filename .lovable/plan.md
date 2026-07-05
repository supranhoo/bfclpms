## Remaining scope for the Criteria Library feature

Locked-in decisions from your answers:
- **Weights must sum to 100** per resolved template; commit is blocked if any cell fails.
- **Exact-grade targeting** in addition to grade bucket — add `grade_code TEXT NULL` referencing `pms_grades.code`. Resolver specificity becomes: sub_unit (16) > dept (8) > grade_code (4) > grade_bucket (2) > archetype (1).
- Suppression stays as the explicit `is_enabled=false` checkbox.
- Import expands per-department rows (no `department_group` table).

## Deliverables

### 1. Migration
- `ALTER TABLE annual_review_criteria_assignments ADD COLUMN grade_code TEXT NULL` + extend the unique index and the `(archetype, grade_bucket, grade_code, dept, sub_unit)` lookup index.
- No FK to `pms_grades.code` (that table's PK is `id`); store the code as text with a `CHECK (grade_code IS NULL OR length(grade_code) BETWEEN 1 AND 32)` guard. Resolver validates it against the loaded grade list at UI time.

### 2. Resolver + service updates
- `criteriaLibrary.ts`: add `grade_code` to `AssignmentUpsertInput`, resolver signature, upsert-select COALESCE chain, and the new specificity scores.
- New helper `validateResolvedWeights(resolved): { ok, sum, delta }` — sum of `weight_pct` must equal 100 (±0.01). Non-numeric bands remain untouched.
- Update `criteriaLibrary.test.ts`: add cases for `grade_code` beating `grade_bucket`, and for the weight-sum validator (100 ok, 95 fails, 100.5 fails).

### 3. Factory integration
- `PlannedRow` gains `criteriaWeightTotal: number` and `criteriaWeightOk: boolean`.
- `previewFactoryRun` computes both from the resolved list.
- `commitFactoryRun` **rejects** any plan where `criteriaSource === 'library'` and `criteriaWeightOk === false` — error message: `"Criteria weights sum to X, must be 100. Fix in Criteria Matrix."` Rows that fall back to the archetype seed are exempt (they carry no weights).
- `templateFactoryBulk.rebuildFactoryTemplatesForCycle` applies the same guard and reports failing templates in its `RebuildResult.errors`.

### 4. Admin UI (three panels under `/annual-review/admin/factory`)
- **CriteriaLibraryPanel** — bilingual CRUD table: key, label EN/HI, max_score, is_common, is_active, sort_order, JSON scoring bands. XLSX import parsing your 5-sheet workbook layout: for each sheet, extract `Criteria` + rating description → creates library rows (dedup on key = normalized label), plus assignment rows per (archetype, grade bucket, department set). XLSX export mirrors the input.
- **CriteriaMatrixPanel** — sparse cell editor. Row = criterion (from library); columns are (Archetype, Grade bucket, Grade code, Department, Sub-unit, Weight%, Enabled). Add-cell form uses combo pickers with NULL = "Any". Delete = row action. Real-time weight-sum badge per (Archetype × Grade × Dept × Sub-unit) preview cell that lights amber when ≠ 100.
- **Factory preview popover** — new column "Criteria" already exists; add a small "Preview" link that opens a Dialog listing the resolved criteria with winning assignment provenance ("won by: grade_code=M4 + dept=Admin", weight, is_common flag).

### 5. XLSX importer
- Located at `src/lib/annualReview/criteriaWorkbook.ts` (mirrors `factoryWorkbook.ts`).
- Sheet-header mapping form: for each sheet the admin picks archetype code, grade bucket, optional grade code, and multiple departments/sub-units. Import creates:
  - Library rows keyed by slugified label_en (existing keys are re-used, updates label_hi if missing).
  - One assignment row per selected department, with `weight_pct` from the sheet's `Wt%` column and `is_enabled=true`.
- "M no Env" flow: importer offers a "suppress these criteria for the selected depts" multi-select which inserts `is_enabled=false` rows.
- Dry-run preview before commit; errors listed inline; commit is transactional per sheet.

### 6. Seed job (one-off)
- Small utility page/button in CriteriaLibraryPanel: "Load bundled BFCL bilingual pack" that reads a copy of the workbook stored at `src/lib/annualReview/data/bfcl-generic-questions.xlsx` (checked into the repo from your upload) and runs the importer for the standard mappings. Idempotent — reruns just update.

### 7. Docs
- `docs/specs/annual-review-template-factory.md`: new "Criteria resolver" section documenting specificity ladder, suppression semantics, and the 100% weight rule; update "Data model" table; add a "Version history" bullet.
- `mem://features/annual-review/overview` index: add "Criteria Library" bullet.

## Risk & Impact

- **Data**: additive `grade_code` column + one new admin-only import path. No touch to `annual_review_template_archetypes`.
- **Workflow**: commit now hard-fails when weights ≠ 100 for library-sourced templates. Existing factory templates still using archetype fallback are unaffected until you populate the library.
- **UI**: three new admin panels; existing factory page gains one preview link and a weight badge.
- **Regression**: `criteriaSource: 'archetype'` fallback keeps every currently-generated template working.
- **Rollback**: drop the new tables + `grade_code` column and revert the resolver call site; archetype seed path is untouched.

## Order of build

1. Migration (`grade_code` column + index).
2. Resolver + tests (`grade_code`, weight-sum validator).
3. Factory + bulk commit guards.
4. `CriteriaLibraryPanel` with CRUD.
5. `CriteriaMatrixPanel` with sparse-cell editor + weight-sum badge.
6. XLSX importer + bundled BFCL seed.
7. Preview popover on the Factory page.
8. Docs + memory index.
