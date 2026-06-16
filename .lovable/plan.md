## Brainstorm & Plan — Annual Review Admin · Progress tab makeover

Scope: redesign the red-boxed Progress section. Keeps Analytics/Calibration/Cycles/Templates/Rules tabs untouched. UI polish + 5 functional additions.

---

### Risk & Impact (read this first)

| Area | Impact |
|---|---|
| Data | Additive only. New DB column on `annual_review_templates.sections` (JSON key `stage_weights`) + optional override on `annual_review_instances` (new JSONB col). No destructive change. |
| Workflow | Final-score formula gains a configurable "preferred weightage distribution". Default = current behavior (criteria_weighted_score + system_scores) — feature gated by presence of `stage_weights`. |
| UI | Toolbar redesign, new per-stage score columns, full-roster pagination already exists server-side — just expose it correctly. |
| Regression risk | Medium. Touches export, finalize math, and bulk dialogs. Mitigation: pure helpers + unit tests; flag-driven rollout (stage-weighted scoring only fires when admin opts in per template). |
| Scalability | Already paginated (25/50/100). Excel export will stream all pages via `fetchAllPaged` cap 5000 with progress toast. |
| Rollback | Revert UI files; new column is nullable and ignored if empty. |

---

### 1. UI makeover (Progress section only)

Current issues (per screenshot):
- Toolbar feels broken: filter row + 5 action buttons wrap awkwardly, no visual grouping.
- Table looks empty (Score/Rating dashes, no per-stage columns, row actions look like plain links).
- No clear pagination footer in the visible frame.

Redesign:
- **Toolbar:** two clean rows inside a `Card`.
  - Row 1: Search (grows), Stage filter, Reviewer filter (new), Template filter (new), "Clear filters".
  - Row 2: Primary action `Finalize selected` (only enabled with selection) + overflow `…` menu containing Send reminders, Export to Excel, Bulk system-score upload, Bulk template assignment, Bulk workflow assignment. Reduces button clutter from 5 → 1 + menu.
- **Table:** new columns — Employee · Stage · Self · Manager · Skip · BU · HR · System · Final · Rating · Actions. Score cells show `—` when stage not yet submitted, dimmed; submitted cells in tabular-nums with subtle bg.
- **Row actions:** consolidate into a single `⋯` menu (Change template, Change workflow, Finalize, View timeline).
- **Footer pagination:** show `Showing 1–25 of 2,560` + page jumper + rows-per-page selector (already wired, just style consistently).
- **Empty/loading:** `Skeleton` rows on first load instead of blank table.

---

### 2. Export to Excel — full dataset

Today: `exportProgress` only exports the current page (`filtered` = page rows).

Fix:
- New service `svc.fetchAllInstancesForExport(cycleId, { search, status, reviewerFilter, templateFilter })` using `fetchAllPaged` (page 500). Honors current filters but ignores pagination.
- Multi-sheet workbook:
  - `Progress` — one row per employee, all stage scores + final.
  - `Stage Detail` — long-format (employee × stage) for pivot.
  - `Filters` — what was applied, exported by, timestamp.
- Toast progress: "Exporting 2,560 rows…". Disable button while running. No more "current page only" caveat.

---

### 3. Full pagination + per-stage scoring visibility

- Pagination already server-side; UI gets a polished footer (above).
- Per-stage scoring: extend `useAnnualReviewInstancesPaginated` to also return each instance's `annual_review_responses` rollup keyed by `reviewer_role` (single `IN` query batched per page) → display per-stage `weighted_score` in the new columns. No N+1.

---

### 4. Template assignment via Excel upload

New dialog `BulkTemplateUploadDialog` (sits alongside existing chooser):
- **Step 1 — Download template:** Excel with columns `Employee Code | Employee Name (read-only) | Current Template | New Template Name` — pre-filled with all in-scope employees. A second sheet `Templates` lists every active template name as a dropdown source (data validation).
- **Step 2 — Upload:** parse, validate (unknown template names, ineligible stages, locked instances), show preview grid with row-level errors and a "skip invalid, apply valid" toggle.
- **Step 3 — Apply:** calls existing `svc.setTemplateOverride` per row inside a batched mutation with progress bar. Atomic per-row; failures collected and re-exportable.

---

### 5. Workflow assignment via Excel upload

Same UX pattern as #4, columns:
`Employee Code | Self (Y/N) | Manager (Y/N) | Skip (Y/N) | BU (Y/N) | HR (Y/N) | Manager Email | Skip Email | BU Email | HR Email`
- Y/N toggles map to `enabled_stages`.
- Email columns resolve to `profiles.id` via `auth_lookup_attempts`/profiles lookup; unresolved → row error.
- Validation prevents disabling `self` (policy invariant). Calls existing per-instance workflow update service in batches.

Both dialogs reuse a new shared `<ExcelBulkUploadPanel>` (download template → upload → validate → preview → apply).

---

### 6. Preferred weightage distribution for final scoring

The plan is to make the final 5/5 a **weighted blend of stage scores + system scores**, configurable per template, with a per-instance override.

**Where it lives**
- New section on `TemplateEditorDialog` → "Final score weights":
  - Rows for each enabled stage (Self, Manager, Skip, BU, HR) + one row "System scores" + one row "Criteria (default)".
  - Each row: numeric weight (0–100). Live total badge ("Total: 100%"). Save blocked unless total = 100.
  - Stored under `template.sections.stage_weights = { self: 20, manager: 50, bu_head: 30, system: 0, criteria: 0 }`.
- Per-instance override: new column `annual_review_instances.stage_weights_override JSONB NULL`, editable from the row "⋯ → Customise weights" by HR/Admin, audit-logged.

**Resolver (SSOT)**
- New pure helper `src/lib/annualReview/finalScore.ts`:
  - `resolveStageWeights(instance, template) → Record<key, number>` — instance override → template.stage_weights → legacy default (criteria 100%).
  - `computeFinalScore({ stageWeights, responsesByRole, systemScoreTotal, criteriaWeightedScore }) → { rawScore_0_100, scaled_0_5 }` — only includes keys with non-null inputs; renormalises if some stages skipped (with policy flag).
- Mirror as PL/pgSQL `public.annual_review_compute_final_score(instance_id)` so server triggers and finalization RPC stay consistent.

**Backward compatibility**
- If `stage_weights` absent → legacy formula (current behavior). No silent change.
- Display: Progress row "Final" column tooltip shows the blend formula in use.

**Tests** (new file `src/test/annualReview/finalScore.test.ts`):
- Legacy fallback when no weights.
- Standard 20/50/30 blend matches hand-computed value.
- Missing reviewer stage → renormalisation.
- Instance override beats template.
- Reject weights totalling ≠ 100 at validation layer.

---

### Files to add / change

Add:
- `src/components/annual-review/ExcelBulkUploadPanel.tsx` (shared 3-step flow)
- `src/components/annual-review/BulkTemplateUploadDialog.tsx`
- `src/components/annual-review/BulkWorkflowUploadDialog.tsx`
- `src/components/annual-review/StageWeightsEditor.tsx` (used in TemplateEditorDialog + per-instance)
- `src/components/annual-review/InstanceStageWeightsDialog.tsx`
- `src/lib/annualReview/finalScore.ts` + test
- New migration: `annual_review_instances.stage_weights_override JSONB`, plus `annual_review_compute_final_score` SQL function.

Change:
- `src/pages/annual-review/AnnualReviewAdmin.tsx` — Progress tab UI restructure, new columns, overflow menu.
- `src/services/annualReview/annualReviewService.ts` — `fetchAllInstancesForExport`, batched per-stage response fetch, weight resolver wiring in `bulkFinalize`/`overrideRating`.
- `src/components/annual-review/TemplateEditorDialog.tsx` — embed `StageWeightsEditor`.
- `src/components/annual-review/HrFinalizationSheet.tsx` — show effective blend + preview.
- `DOCUMENTATION.md` + `POLICY.md` + `docs/adr/ADR-annual-review.md` — record final-score policy, Excel upload flows, export contract.

---

### Open questions before build

1. **Stage-weights scale:** lock to total = 100, or allow any total and auto-renormalise? (I recommend strict 100% for auditability.)
2. **Excel upload — partial apply:** allow "skip invalid rows, apply valid"? (Recommend yes, with downloadable error report.)
3. **Per-instance weight override:** restrict to Admin + HR PMS only, or also BU/Management? (Recommend Admin + HR PMS.)
4. **Backfill:** for the current active cycle, leave legacy formula until admin sets weights, or migrate existing templates to an explicit `{criteria: 100}` so the UI always shows weights? (Recommend explicit backfill — no behavior change but clearer UI.)

Approve, tweak any of the four, or tell me which sub-items to drop and I'll build.
