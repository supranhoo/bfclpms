## Reading the uploaded BFCL workbook

Structure per sheet (40 sheets, one per **BU × Grade-bucket × Dept**):

| Block | Example | Varies by |
|---|---|---|
| **Eligibility** (4 gates) | Absent Days, LWP, Disciplinary, 6-Month | Constant across all forms |
| **System KPIs** (9 items) | LTI, STI, UA UC NM, 5S, Training, Fugitive, Annual Production, Annual Maintenance | **Weight varies** per sheet (e.g. Annual Production = 25 in CLU-W-E&I, 20 in SMS-W-Ops, 30 in CLU-M-E&I) |
| **Standard Questions** (W-grade only, 5 items) | Attendance, Safety, Quality, Teamwork, Care of Tools — bilingual with 6 rating bands each | Same criteria + labels for every W sheet; only weights change |
| **Dept-specific technical** (W-grade, 5 items) | E&I: Thermocouple / Load-cell / Bag Filter / Pull-Chord / VFD | **Question text AND 0-5 labels differ per dept** |
| **M-Grade Metrics** (M-grade, 5 items) | "CLU - E&I KPI & Target Achievement" etc. | Question text differs per (BU, Dept); labels share a leadership rubric |
| **Self-Review Fields** (5 open text) | "Best achievement…" etc. | Constant across all forms |

Total unique criterion rows to load: ~5 shared + 5×5 depts (W) + 5×5×5 (M dept variants) ≈ ~55 library rows; ~40 assignment matrix cells; 40 × 9 = **360 system KPI weight rows**.

---

## Plan — map this workbook to the existing model in one importer

The schema already supports every dimension you need (criteria library × assignment matrix × per-cell system KPI weights × self-review bundle × eligibility). The missing pieces are: **(a) the workbook importer** that lands your Excel exactly as authored, **(b) the bands→options mapper** so reviewers see the labelled 0-5 buttons, and **(c) a friendly bands editor** for post-import tweaks.

### 1. New "BFCL Forms Workbook" importer (`src/lib/annualReview/bfclFormsWorkbook.ts`)

Parses the exact sheet layout above and returns a preview plan:

```
{
  criteria: CriterionUpsert[],           // library rows (dedup by canonical key)
  assignments: AssignmentUpsert[],       // criterion × (archetype, grade_bucket, dept, sub_unit)
  systemKpiWeights: SystemKpiWeightRow[],// (dept, grade_bucket) → {kpi, weight_pct}
  eligibility: EligibilityGate[],        // written once to archetype default
  selfReviewFields: SelfReviewItem[],    // bundle items
  warnings: string[],                    // sheets with weight ≠ 100, missing bands, etc.
}
```

Parsing rules:
- Sheet name pattern `^(BU) - (M|W) - (Dept)$` → drives assignment context. `Form Index` sheet skipped.
- Row where col A = `Eligibility` / `System` / `Type` marks the block boundary.
- Description cell like `5 - Always on time / हमेशा समय पर\n4 - … \n0 - …` → parsed into `scoring_bands: [{score, label_en, label_hi}]` (Hindi split on ` / `). Empty bands fall back to shared 0-5 ladder.
- Weight column → `weight_pct` on the assignment (not on the library row — same criterion can have different weights per dept).
- Canonical key = slug(label_en without `/hindi`). Duplicates upsert.

New admin panel button: **"Import BFCL Forms Workbook"** (dry-run preview showing all 40 cells with green/amber diffs, then Commit).

### 2. Library → template criterion mapper (from prior plan)

`bandsToOptions(scoring_bands, max_score)` produces the `options[]` array the reviewer form (`CriteriaScoringMatrix`) already renders. Wired into `templateFactory.ts` + `templateFactoryBulk.ts`. Without this the imported bilingual labels never appear as buttons.

### 3. Friendly bands editor in `CriteriaLibraryPanel`

Replace the raw JSON textarea with a per-score row editor (Score / Label EN / Label HI) and a "Reset to default ladder" action. Advanced disclosure keeps raw JSON for power users.

### 4. Per-cell system KPI weights

Importer writes `annual_review_system_kpi_weights` rows keyed by `(department_id, grade_bucket, kpi_code)` so Annual Production = 25 for CLU-W-E&I and 30 for CLU-M-E&I stay independently editable. `TemplateFactory` already resolves via this table; add a small "System KPI Weights matrix" viewer to Admin to confirm post-import.

### 5. Rollout Readiness page (40-cell coverage matrix)

Grid of BU × Grade × Dept. Each cell shows:
- Criteria weight sum (must = 100)
- System KPI weight sum
- # of missing bilingual labels
- Green / amber / red badge

Blocks factory commit until all 40 cells are green.

### 6. Tests + docs

- Unit: parse a golden sheet, assert criteria/assignments/weights match fixture.
- Unit: `bandsToOptions` on real BFCL band strings (`5 - X / हिंदी\n4 - Y / हिंदी`).
- Snapshot: reviewer render for `CLU-W-E&I` vs `SMS-W-Ops` differs only in dept-specific 5 criteria + weights.
- Update `docs/specs/annual-review-template-factory.md` + memory `mem://features/annual-review/bfcl-forms-import.md`.

### Out of scope

- No schema changes — all target tables already exist.
- No change to reviewer/manager UI beyond it finally receiving populated `options[]`.
- No historical form migration; only forward cycles use the imported masters.

---

**Approve to implement all six sections**, or tell me to:
(a) do only the importer + bands mapper first and skip the readiness matrix,
(b) split the M-grade criteria across BUs vs a single leadership rubric with per-BU weight overrides,
(c) treat the "Standard Questions" block as a hardcoded preset instead of library rows (I'd advise against — you lose per-cycle editability).
