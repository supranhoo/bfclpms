# Plan — Fix misleading details on `ADMIN_DATA_ENTRY_*` timeline rows

## 1. Assumptions
- You don't want to rewrite or backfill historical audit rows. Behaviour change is render-only in `src/components/dashboard/KpiTimeline.tsx`.
- The audit table (`public.kpi_audit_logs`) remains the SSOT (POLICY §104, ADR / mem `kpi-audit-logs-canonical`). We never drop rows or mutate `new_value` / `metadata`.

## 2. Root cause (what the screenshot actually shows)
The row was written by `useAdminSubmitReviewData` (`src/hooks/useAdminDataEntry.ts` L270–283):

```
action: ADMIN_DATA_ENTRY_HR_PMS
on_behalf_of: <employee_id>          ← Shekhar Gope
new_value:  <entire review_submissions row after upsert>
metadata.fields_updated: [hr_pms_achieved_value, ...]   // only what admin really touched
```

`KpiTimeline.formatDetails` (L222–300) then walks `new_value` and prints **every** populated column — `self_score`, `manager_score`, `self_remarks`, `manager_remarks`, `self_rating`, `manager_rating` — even though Admin only edited the HR PMS stage. Result: pre-existing self / manager values look like fresh edits, and the `*_rating` RAG colour enum (`red|yellow|green|blue`) is printed as “Rating: blue”, which looks wrong because the user-facing rating is the 0–5 score.

The `on_behalf_of = employee_id` is also misleading for impersonal stages (HR PMS, Audit, Management): admin is acting **as that stage**, not on the employee's behalf. For SELF / MANAGER stages the “on behalf of” framing is still correct because admin is impersonating that person.

## 3. Risk & Impact
- **Data impact:** None. No DB / RPC / migration change. Audit immutability preserved.
- **Workflow impact:** None. Only the Review Timeline popover changes.
- **UI/UX impact:** Cleaner timeline for all `ADMIN_DATA_ENTRY_*` rows, historical and new.
- **Regression risk:** Low. Other actions (self/manager submits, ADMIN_OVERRIDE, propagation, query/observation) unchanged. We branch on `action.startsWith('ADMIN_DATA_ENTRY_')`.
- **Scalability:** Pure presentational filter — O(fields).

## 4. Step-by-step change (single file: `src/components/dashboard/KpiTimeline.tsx`)

### 4a. Restrict `formatDetails` for `ADMIN_DATA_ENTRY_*`
When `log.action.startsWith('ADMIN_DATA_ENTRY_')`:
- Build the `details` list from **only** the fields listed in `log.metadata.fields_updated` (already written by the hook).
- Map field → label exactly once, using the columns that hook actually writes:
  - `achieved_value` / `<role>_achieved_value` → `Added Value: <v>`
  - `<role>_score` → `Score: <v>` (single line, not Self+Manager+Auditor+Management)
  - `<role>_remarks` → `Remarks: <v>`
  - `<role>_evidence_url(s)` → `Evidence updated`
  - `is_na = true` → `Marked as N/A`
  - `final_score` (only when approving) → `Final Score: <v>`
- **Drop the `*_rating` line entirely.** Those columns hold the RAG colour band (`red|yellow|green|blue`), not the 0–5 rating; they are derived and don't belong in the user-facing timeline. (Score line covers what the user expects.)
- Keep `Admin Reason: …` from `metadata.reason` at the top — that's the only useful pre-existing line.
- Fall back to the existing generic loop if `metadata.fields_updated` is missing (defensive — older rows still render, just without the new filter).

### 4b. Stop labelling impersonal stages as "on behalf of"
In the JSX block at L425–434, for `ADMIN_DATA_ENTRY_HR_PMS | ADMIN_DATA_ENTRY_AUDITOR | ADMIN_DATA_ENTRY_MANAGEMENT`, suppress the `(on behalf of …)` suffix and instead append `for <employee>` in muted text. Keep the existing red “on behalf of …” wording for `ADMIN_DATA_ENTRY_SELF` and `ADMIN_DATA_ENTRY_MANAGER`, where impersonation actually happens.

### 4c. No other code paths touched
- `useAdminDataEntry.ts` stays as-is — keeping `new_value: newSubmission` preserves audit completeness (`fields_updated` already gives us the diff).
- `groupTimelineEvents`, PDF export, and other consumers unchanged.

## 5. UI changes (exact)
- **Location:** Review Timeline popover → Admin Data Entry card (and its PDF mirror only renders what is in `details`).
- **Before (your screenshot):** Admin Reason, Added Value, Self Score, Manager Score, Rating: blue, Rating: blue, Self Remarks, Manager Remarks.
- **After (HR PMS admin entry that only set `hr_pms_achieved_value` + reason):**
  - `ADMIN DATA ENTRY HR PMS` — by Ankit Choudhary · **for Shekhar Gope** (muted, not red)
  - • Admin Reason: Update
  - • Added Value: 0
  - (no Self/Manager score, no Rating, no Self/Manager remarks)
- **After (Admin entering Self or Manager data):** still shows the red `(on behalf of …)` suffix because impersonation is real there.
- Responsiveness untouched.

## 6. Tests
- Add `src/test/kpiTimelineAdminDataEntry.test.ts` covering `formatDetails`:
  1. `ADMIN_DATA_ENTRY_HR_PMS` with `metadata.fields_updated = ['hr_pms_achieved_value']` and a full `new_value` snapshot → returns only `Admin Reason` + `Added Value`. No `Self Score`, no `Manager Score`, no `Rating`, no remarks.
  2. `ADMIN_DATA_ENTRY_SELF` with `fields_updated = ['achieved_value','self_remarks']` → `Added Value` + `Remarks`, no Score line.
  3. `ADMIN_DATA_ENTRY_MANAGER` with `is_na = true` in fields_updated → `Marked as N/A` only.
  4. Legacy row without `metadata.fields_updated` → falls back to existing renderer (regression guard).
- Add a small JSX snapshot/RTL test that asserts the `for <employee>` muted suffix appears for HR PMS / Audit / Management and the red `(on behalf of …)` suffix appears for Self / Manager.

## 7. Documentation
- **DOCUMENTATION.md:** add a v-bump entry under Review Timeline describing the `ADMIN_DATA_ENTRY_*` filter (uses `metadata.fields_updated`, suppresses RAG `*_rating` colour, switches “on behalf of” → “for” for impersonal stages).
- **POLICY.md:** add a short clause: “Review Timeline must render `ADMIN_DATA_ENTRY_*` rows from `metadata.fields_updated` only; the RAG `*_rating` colour columns are derived and must not surface as ‘Rating’.”
- **mem:** new `mem/features/review/admin-data-entry-timeline-rendering.md` capturing the filter + on-behalf wording rule, referenced from `mem/index.md`.

## 8. Rollback
Single-file revert of `KpiTimeline.tsx` (and removing the new test + mem file). No DB / data migration to roll back.

## 9. Open question (please confirm before I build)
For the impersonal stages (HR PMS / Audit / Management), do you prefer:
- **(a)** show `for Shekhar Gope` in muted text (keeps employee context), or
- **(b)** drop the suffix entirely so the line reads just `by Ankit Choudhary`?

The KPI card header already names the employee, so (b) is also defensible. I'll go with **(a)** unless you say otherwise.
