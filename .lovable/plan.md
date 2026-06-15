## 1. Assumptions

- The screenshot is from `/admin/org-kpi-data`, June 2026, MIS & Reporting → `Raw Material Plan & Other MIS` for employee Bhoopendra Kumar Sinha.
- Biswajit Sahoo is acting as the data owner/manager, not Admin mode.
- The requested deliverable is RCA + a safe implementation plan; no code will be changed until approved.

## 2. Clarifications

Not Applicable.

## 3. RCA, 5 Why

### Observed facts from live data

- Biswajit Sahoo is active and has manager role.
- Bhoopendra Kumar Sinha is active.
- Biswajit is assigned as data owner for this exact KPI.
- Bhoopendra’s June 2026 child KPI exists and is still `kra_set`.
- There is no June 2026 `org_kpi_values` row and no `review_submissions` row for Bhoopendra for this KPI.
- The UI screenshot still shows a local `0` value, a `Saved` label, and also an “Unsaved — wait for autosave…” micro-message. Those two states contradict each other.
- Backend RPC overload ambiguity is not present now: only one `preview_org_kpi_propagation(...)`, one `propagate_org_kpi_value(...)`, and one resolver function exist.

### 5 Why

1. **Why did Biswajit see “Partial propagation: 0/1 employees updated”?**
   - The propagate flow attempted one visible row, but no review submission was written.

2. **Why was no review submission written?**
   - The value visible in the row was not actually persisted to `org_kpi_values` for June 2026; the page allowed propagation from a local stale/unsaved `0` state.

3. **Why did the page think it was saved?**
   - `handleCardSave` / `useBulkUpsertOrgKpiValues` can treat a zero-row save result as success. The UI can then clear dirty state and show `Saved` even when the DB accepted zero rows.

4. **Why did the row still show `0` and allow propagate?**
   - The UI preserves local scoped row state after a failed/zero-row save and the per-row Propagate button only checks local value + dirty flag, not “is this value persisted?”. The message still says “wait for autosave” even though autosave was replaced by explicit Save.

5. **Why did the error say “mismatched KPI names” instead of “unsaved / not persisted”?**
   - The completeness check only accounts for server skips. Client-side “untouched zero / not persisted zero” skips are not counted as an accounted skip, so the remaining gap falls through to the old “may have mismatched KPI names” toast.

## 4. Risk & Impact Report

- **Data Impact:** No destructive data change planned. The fix prevents propagation unless the exact scoped value is confirmed saved.
- **Workflow Impact:** Data owners must Save the row successfully before propagation. This aligns with the explicit-save policy already in the UI.
- **UI/UX Impact:** The row will stop showing contradictory “Saved” + “Unsaved” states. Propagate will be disabled for unsaved/local-only values.
- **Regression Risk:** Medium, because Org KPI propagation has multiple historical policies. Mitigation is narrow changes + focused regression tests.
- **Security Impact:** Active risk found: `propagate_org_kpi_value` is `SECURITY DEFINER` and directly executable by authenticated users without its own authorization gate. The resolver checks authorization, but the write RPC itself must also check it.
- **Scalability Impact:** No full-table client scans added. Existing chunked saves stay chunked at 500 rows. Additional checks compare attempted-row counts only.
- **Rollback Strategy:** Revert the frontend changes and, if the DB hardening migration is included, restore the previous RPC definition from the prior migration. No data rollback needed.

## 5. Step-by-step Plan

### Step 1 — Stop false saved state

- In `src/pages/admin/OrgKpiDataEntry.tsx`, capture the return value from `bulkUpsert.mutateAsync(safeToSave)`.
- If `safeToSave.length > 0` but returned saved rows are fewer than attempted rows, throw a clear error and do not continue to propagation.
- Keep existing orphan/hidden-profile toasts, but do not silently mark the card as saved when zero rows were written.

### Step 2 — Make row Propagate require persisted data

- In `src/components/admin/OrgKpiScopedEntryTable.tsx`, disable row-level Propagate when:
  - the row is dirty, or
  - the local achieved value differs from `dbAchievedValue`, or
  - the local `0` has no saved OKV value.
- Replace stale copy: “Unsaved — wait for autosave, then Propagate” with explicit-save copy: “Unsaved — click Save row, then Propagate”.
- Keep the per-row Save button as the expected action.

### Step 3 — Fix false mismatch classification

- In `executeSaveAndPropagate`, account for client-side untouched/unsaved zero skips separately so they do not fall through to “mismatched KPI names”.
- Keep the dedicated zero-value warning, but do not also show the destructive mismatch toast for the same row.

### Step 4 — Normalize remaining save lookups

- Replace raw `.toLowerCase()` key construction in `handleCardSave` with the existing `kpiKey(...)` helper.
- This removes a contradiction with ADR-054 and prevents old-value/audit/null-overwrite logic from drifting on whitespace or carriage returns.

### Step 5 — Align preview and partial-row guard with actual intent

- For row-level propagate (`filterEmployeeIds` present), skip the full-card half-propagation guard or compare only the attempted subset.
- This prevents “N mapped employees not in your view” when the user intentionally propagated one employee.
- Keep full-card guard unchanged for full-card propagation.

### Step 6 — Harden backend authorization

- Add a migration to update `public.propagate_org_kpi_value(...)` so each `kpi_id` is writable only when the caller is Admin or an assigned data owner for that KPI’s normalized `(category_id, kra_name, kpi_name)`.
- Unauthorized direct RPC calls should be rejected before writing `review_submissions`.
- Preserve the current overwrite policies and approved-row immutability.

## 6. UI Changes

- **Location:** Org KPI Data Entry → scoped employee row actions.
- **Visual change:** Propagate arrow remains disabled until the row’s current value is persisted.
- **Interaction impact:** User flow becomes: edit value → click row Save → see successful save → click row Propagate.
- **Responsiveness:** No layout changes; only button disabled state and tooltip/microcopy updates.

## 7. Implementation

- Surgical frontend changes in:
  - `src/pages/admin/OrgKpiDataEntry.tsx`
  - `src/components/admin/OrgKpiScopedEntryTable.tsx`
- Backend hardening migration for:
  - `public.propagate_org_kpi_value(jsonb, boolean, text, text)`
- No changes to unrelated Org KPI workflows, KRA library, or scorecard review screens.

## 8. Tests

Add/update focused tests:

- Zero-row save result must fail instead of showing saved.
- Persisted-vs-local row state disables row Propagate.
- Unsaved zero skip does not emit the “mismatched KPI names” toast.
- `handleCardSave` uses canonical KPI keys.
- Row-level propagation subset does not trigger full-card half-propagation warnings.
- RPC contract test verifies `propagate_org_kpi_value` contains an authorization gate.

## 9. DOCUMENTATION.md updates

- Add a version note explaining explicit Save → Propagate contract.
- Document that “Saved” means the backend returned at least one persisted row, not only that the mutation completed.

## 10. POLICY.md updates

- Add/adjust Org KPI policy: propagation must only run from persisted OKV rows; local-only values must be blocked.
- Add security policy: propagation write RPC must enforce Admin/data-owner authorization internally, not rely only on a prior resolver.

## 11. Post-implementation notes

- No data repair should be run automatically for this case. The June row has no saved OKV/review submission, so after the fix Biswajit should Save the row again and then Propagate.
- Backup impact is unchanged because no new table is introduced.