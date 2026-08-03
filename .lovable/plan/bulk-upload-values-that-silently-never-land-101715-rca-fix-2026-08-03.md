# Bulk Upload: values that silently never land (101715 RCA + fix)

## What I verified in the live data

Employee 101715 (Jitendra Bharti), cycle 2025-2026:

- Instance status is **`completed`** (last updated 23-Jul-2026), not `pending_self` as the sheet shows — the sheet was produced from an older download.
- Effective template = **Generic M - (With KRA)**. Its `system_scores` section contains **exactly one slot**, an auto-computed `carry_kra` slot (weight 100). It has **no** LTI / STI / UA-UC-NM / 5S / Training / Fugitive PM10 / Production / Preventive-Maintenance slots at all.
- Stored `system_scores = {"sys_bgd6797": 90.70}`, `total_score = 90.70`, `eligibility_inputs = {}`.
- The template *does* define the 4 eligibility criteria (Absent Days, LWP Days, Disciplinary Actions, 6 Month Completion), and 113 of the 116 completed instances on this template have them filled — so eligibility mapping itself works.

## Root cause (two independent causes, both silent)

1. **Columns not present in the employee's template are dropped without a word.** The single-sheet uploader builds one union of columns across all templates. In `runDryRun`, per cell: `const slot = inst.slotByCanonical.get(...); if (!slot) continue;` — no warning, no row note. For 101715 all 8 safety/production numbers you typed target slots that do not exist on his form, so they can never be stored. The row then reports "No changes", which reads like "already up to date" rather than "12 values discarded".
2. **On a `completed` row, eligibility values are refused by design.** Even with the completed-upgrade opt-in, the code emits `"<col>" skipped — eligibility inputs cannot be modified on completed reviews` (ADR-171 keeps completed rows to monotonic system-score upgrades only). Without the opt-in the whole row is skipped at stage classification. That is why his 4 eligibility answers are still empty while his cohort is filled.

So nothing was lost or overwritten — the values were never write-eligible. The defect is that the tool did not say so.

## Fix

### 1. Never drop a value silently (core fix)
In `src/services/annualReview/cycleBulkDataUpload.ts`, replace the bare `continue` for an unmapped column with a per-cell warning:
`"<column>" ignored — not part of this employee's template (<template name>)`.
These warnings attach to the row exactly like the existing `warnings[]`, so a row whose *only* content is unmapped values is reported as **skip — 12 values ignored (not in template)** instead of "No changes".

### 2. Dry-run summary counters + badge
Add `ignoredCellCount` and `ignoredByColumn` to `DryRunReport`, and render in `CycleBulkDataUploadDialog.tsx` an amber badge `N values ignored (not in template)` next to the existing apply/skip/downgrade badges, expandable to a per-column breakdown (column → count → affected templates). This makes a whole-cohort mistake visible before commit.

### 3. Download-time guardrail
`downloadBulkTemplate` already writes an empty cell for non-applicable columns. Add a visual marker so a filler knows the cell is not editable: write `n/a` for cells whose column is not in that row's template, and teach the importer to treat a literal `n/a` as "leave alone". Also add a note to the dialog help text explaining that only columns belonging to the row's Template are writable.

### 4. Eligibility on completed reviews — explicit admin path
Keep the current default (blocked). Add an admin-only opt-in **"Also correct eligibility inputs on completed reviews"**, visible only when the completed-upgrade opt-in is on, requiring the same >=10-character reason. It routes through a new SECURITY DEFINER RPC `admin_apply_eligibility_inputs_correction(p_instance_id, p_eligibility_inputs, p_reason)` — `admin` / `hr_pms` only, merges (never replaces) the JSONB, writes a before/after row to `annual_review_access_audit` under a new allowed action `eligibility_inputs.admin_correction`, and re-invokes `annual_review_apply_final_summary` so the final score / eligibility outcome stays single-writer (ADR-235). `overall_status` is never touched.

### 5. Repair for 101715 (and any sibling)
After #4 ships, re-run the upload for the affected rows with the eligibility opt-in on, so his 4 eligibility answers land. The 8 safety/production values stay out — they do not exist on his form; if HR believes he should be scored on them, that is a template-assignment change (Bulk remap), not an upload.

## Risk & impact

- **Data:** no schema change except one new RPC and one new audit action value; all writes are merge-only and audited. Existing upload behaviour is byte-identical when the new opt-in is off.
- **Workflow:** unchanged; no status transitions.
- **UI:** additive badge + one checkbox in the Bulk Data Upload dialog.
- **Regression risk:** low; contained to the uploader. New unit tests in `src/test/annualReview/` cover: unmapped column produces a warning and is counted; `n/a` round-trips as a no-op; eligibility opt-in off keeps the current skip message; a legitimate `0` value is still applied.
- **Rollback:** drop the RPC, revert the two client files.

## Docs
ADR-239 (Bulk upload cell-level transparency + eligibility correction path), POLICY §AR-BULK-UPLOAD-NO-SILENT-DROP, DOCUMENTATION.md version history.