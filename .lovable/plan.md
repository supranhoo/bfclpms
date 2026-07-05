
# Admin KPI Editor — "This + future months" behaviour

## 1. Is the field you edited supposed to propagate?

Yes — with one important caveat.

When you save with **"This + future months"** selected, `AdminKpiEditorForm` does two things:

1. Updates the current month's KPI row with **all** editable fields (structural + status + achieved).
2. Runs a **sibling bulk-apply** against every other `kpis` row that matches the same employee + KRA name + KPI name, within the current fiscal year window, and (for "future months") whose calendar position is strictly after the current month. On each match it writes an `admin_bulk_apply` audit log.

The sibling pass only copies **structural fields**. Everything workflow-related is intentionally left alone so approved/in-progress months aren't corrupted.

### Structural fields that DO propagate to future months
- `kpi_description`
- `uom`, `uom_type`
- `weightage`
- `frequency`, `frequency_cycle_start`
- `criteria` (this is the free-text "CLMS implementation as per plan / Formula / Target / Last completion month …" block visible under the KPI name — only propagated when `uom_type = 'numeric'`)
- `source_of_data`
- Scoring bands `r5, r4, r3, r2, r1, r0` (numeric UOM only)
- `is_org_level`, `org_level_scope`
- `qualitative_options` (tiered/binary UOM only)
- `require_resubmit_reason`
- `day_count_type` (Daily frequency only)
- `threshold_mode` (numeric UOM only)

### Fields that DO NOT propagate to siblings
- `status` (workflow stage)
- `review_period`, `review_year`
- `achieved_value`, remarks, evidence, sub-factor values
- `final_score` and any per-stage score snapshot on `review_submissions`
- KRA name / KPI name (used as the JOIN key, so a rename on the current month leaves siblings orphaned)
- Employee, category, reporting manager

This matches the on-screen note: *"Structural fields applied to sibling KPIs. Status & achieved values unchanged."*

## 2. So what should have flown into July 2026 in your case?

The change you made — adding the line **"Last completion month: 5 for 100%"** to the description text under the KPI name — lives in the `criteria` column. That column IS in the propagation list, so July 2026 (status `KRA Set`, same KRA/KPI) is expected to receive it.

The fact that July still shows the old text means one of a small number of things is true. In priority order:

### A. Name-key drift between June and July rows (most likely)
The sibling lookup is:
```
employee_id = <same>
AND kra_name  = <June row's kra_name>   -- exact match
AND kpi_name  = <June row's kpi_name>   -- exact match
AND review_year IN (fiscalStart, fiscalStart+1)
AND id <> <June row id>
```
This is a raw equality match — no trimming, no case-folding, no whitespace collapse. ADR-054 documented that historical rows drifted on exactly this kind of key (stray `\r`, doubled spaces, case). If July 2026 was created by monthly rollover before the drift was normalised, its `kra_name` / `kpi_name` can differ from June by an invisible character and the sibling query will silently return zero rows — meaning the June save succeeds, no "+ N sibling month(s) updated" toast appears, and July is left on the old text.

### B. July row wasn't a sibling — it's a fresh KPI
If July 2026 was created via a different path (Copy KRAs, Smart KRA assignment, manual add) with even a one-character name difference, same outcome as (A).

### C. `uom_type` on July isn't `numeric`
`criteria` (and the R-bands) are only written into the update payload when the FORM's `uom_type` is `numeric`. This gates the payload, not the match, so it applies uniformly — but worth confirming the KPI is indeed numeric on both months.

### D. `review_period` on July is stored as something other than a full month name (`"Jul"` vs `"July"`)
The client filter drops any sibling whose `review_period` isn't in the calendar-month array. A short-form value would be silently filtered out.

## Diagnostic plan (read-only — no code changes yet)

I want to confirm which of A–D is true before proposing a fix, so the fix targets the actual root cause.

1. Pull the two rows from `kpis` for this employee + this KPI, June 2026 and July 2026, and compare:
   - `kra_name`, `kpi_name` byte-for-byte (length, hex dump of trailing chars)
   - `review_period`, `review_year`, `uom_type`, `criteria`
2. Pull the most recent `kpi_audit_logs` entry for the June row where `action = 'admin_bulk_apply'` (source row) and any `admin_bulk_apply` rows keyed to July (target row). Absence of a July target row proves the sibling matcher didn't see July.
3. If (A) is confirmed, the fix is to switch the sibling lookup in `AdminKpiEditorForm.tsx` to the canonical `normalizeText` comparison already used for Org KPI joins (ADR-054), rather than raw `.eq()`.

## Risk & Impact (of the diagnostic step only)
- Data Impact: none — SELECT only.
- Workflow Impact: none.
- UI Impact: none.
- Regression Risk: none.

## Next step
On approval I will run the two read-only queries above, report exactly which row broke the match, and then come back with a scoped fix plan (either name normalisation in the sibling matcher, or a one-shot data repair for the drifted row — whichever the evidence points to). No code changes will happen in this turn.
