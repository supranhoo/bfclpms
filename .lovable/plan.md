## Goal

Replace the 5-option "Download data" + 4-option "Upload data" menus on the Annual Review Admin Progress tab with **one** download workbook and **one** upload workbook. The workbook carries every editable field per employee; on upload, the system applies **only the cells the user actually changed** — everything else is skipped (governance-safe).

---

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | No schema change. Writes flow through the same RPCs (`setTemplateOverride`, `setInstanceStageWeightsOverride`, `updateInstance`, `bulkSetEnabledStages`). All RLS / audit logs unchanged. |
| Workflow | Eligibility gates (`not_started` / `pending_self`) still enforced server-side. A row that touches an ineligible field reports an error in the preview rather than silently failing. |
| UI/UX | Toolbar collapses from 2 dropdowns × 5 items → 2 plain buttons. Old per-dataset dialogs stay in code (deep-link / fallback) but are removed from the toolbar. |
| Regression | The four existing builders in `src/lib/annualReview/bulkTemplates.ts` are reused — output workbook is their **outer join** on Employee Code. Existing dialogs and their tests stay intact. |
| Scalability | Cycle has at most ~few thousand employees; one workbook with ~15-20 columns is well within XLSX limits. Apply step batches one RPC per changed field per row, sequential (matches current bulk dialogs). |
| Mitigation | Dry-run preview (rows × changed-field count, with per-cell from→to diff) before any write. Snapshot of original values embedded as a hidden sheet `__baseline` so the parser can detect deltas even if the user re-sorts rows. |

---

## Pros / Cons of the unified approach

**Pros**
1. One mental model: download → edit anywhere → upload. No "which template do I need?".
2. Eliminates the risk of overwriting unrelated fields — upload is **delta-only**, driven by a baseline snapshot.
3. Cross-field edits in one pass (e.g. change template AND adjust stage weights for the same person).
4. Single audit trail entry per row's reason.

**Cons / mitigations**
1. Wider sheet (~18 columns). Mitigation: column grouping + freeze header + a `README` sheet describing each column and allowed values.
2. Reason column must cover multiple field changes per row. Mitigation: one mandatory `Reason` per row; reused for every field changed on that row (matches today's per-dialog UX).
3. Heterogeneous validation (templates / Y-N / numeric weights / system scores). Mitigation: per-cell validators reuse the exact rules already in the four dialogs.

---

## Design — Unified workbook

**Sheet 1: `Annual Review`** — one row per instance.

Frozen columns (read-only, greyed):
- `Employee Code`, `Full Name`, `Department`, `Business Unit`, `Manager`, `Current Stage`

Editable column groups (headers prefixed so users see grouping):
- **Template** — `Template (current)`, `Template (new)` *(blank = no change, `CLEAR` = remove override)*
- **Workflow stages** — `Self`, `Manager`, `Skip`, `BU`, `HR` *(Y / N, blank = no change)*
- **Stage weights %** — `Self %`, `Manager %`, `Skip %`, `BU Head %`, `HR %`, `System %`, `Criteria %` *(blank = no change; if **any** weight cell is edited the row's weights must sum to 100)*
- **System scores** — one column per `template.sections.system_scores[*].name`
- **Eligibility** — one column per `template.sections.eligibility_criteria[*].name`
- `Reason` *(required if any editable cell on the row is changed)*

**Sheet 2: `__baseline`** (hidden) — snapshot of every editable cell at download time, keyed by `instance_id` (also written into a hidden column on Sheet 1). The parser diffs Sheet 1 against `__baseline` to compute the change-set per row. If `__baseline` is missing/tampered the upload falls back to "blank = no change" semantics and warns the user.

**Sheet 3: `README`** — column reference, allowed values, stage-eligibility rules.

---

## Implementation Steps

### Step 1 — `src/lib/annualReview/unifiedWorkbook.ts` (new)
- `buildUnifiedWorkbook({ cycle, template, instances, templatesById, lookup })` — composes the 3 sheets above. Reuses logic from the existing `bulkTemplates.ts` builders for column lists.
- `parseUnifiedWorkbook(file)` → returns `{ rowChanges: Array<{ instanceId, employeeCode, reason, fieldEdits: FieldEdit[] }>, parseErrors }`. Diffs against `__baseline`.

### Step 2 — `src/lib/annualReview/unifiedApply.ts` (new)
- `classifyChanges(changes, instances, templates)` → reuses each dialog's existing validator to produce per-cell outcomes (`apply` / `noop` / `error`) — the union of the four current classifiers, plus the `not_started | pending_self` eligibility gate for template / workflow / weights edits.
- `applyChanges(outcomes, onProgress)` → routes each cell to the right service call:
  - template → `bulkSetTemplateOverrides`
  - workflow Y/N → `bulkSetEnabledStages`
  - stage weights → `bulkSetInstanceStageWeights` (existing)
  - system scores / eligibility → `updateInstance(id, { system_scores, eligibility_inputs })`
- Per-row reason is reused for every RPC the row triggers.

### Step 3 — `src/components/annual-review/UnifiedBulkDialog.tsx` (new)
- One dialog: `Download workbook` button + file picker for upload.
- After parse → preview table grouped by row with expandable per-cell diff (from → to).
- Counters: `N rows · M cell changes · K errors`.
- `Apply` button → calls `applyChanges` with progress bar.

### Step 4 — `src/pages/annual-review/AnnualReviewAdmin.tsx`
- Replace the two `DropdownMenu` toolbars with two plain buttons: **Download workbook**, **Upload workbook** (both open `UnifiedBulkDialog`).
- Keep `Progress snapshot` export as a separate item *only* if it includes computed fields the unified workbook intentionally excludes (decision below). Default plan: **fold it in** — the unified workbook is the snapshot, since it already contains every editable field plus the read-only employee/stage columns.
- Remove imports for the four bulk dialogs from this page (files retained for now, deleted in a follow-up after one cycle of use).

### Step 5 — Tests (`src/test/annualReview/unifiedWorkbook.test.ts`)
- Headers contract: required column groups exist.
- Parser: blank cell ⇒ no change; modified cell ⇒ change; baseline tamper ⇒ warning + falls back safely.
- Classifier: ineligible stage rejects template / workflow / weights edits but still accepts system scores when policy allows.
- Apply router: each field type calls the matching service (mocked) exactly once.

### Step 6 — Docs
- `DOCUMENTATION.md` — new section "Unified bulk workbook (v2.66.36)" describing sheets, delta semantics, governance.
- `POLICY.md` — clarify: "Bulk edits via the unified workbook are delta-only. Cells left unchanged from the downloaded baseline are never written. Per-row `Reason` is mandatory whenever any cell changes."

---

## UI Changes

- **Where:** `/annual-review/admin` → Progress tab toolbar (second row).
- **Before:** `[Send reminders] [Download data ▾] [Upload data ▾]`
- **After:** `[Send reminders] [Download workbook] [Upload workbook]`
- Inside the upload dialog: preview table with per-row expandable diff, then `Apply N changes` button.
- No responsive impact; uses the same dialog width as the current bulk dialogs.

---

## Out of Scope
- Schema changes, new RPCs, new RLS policies.
- Removing the four legacy dialog files (kept one cycle for rollback).
- Changing column rendering in the main table.
