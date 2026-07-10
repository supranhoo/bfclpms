## Problem

Bulk Actions today has no way to bring an **excluded** employee back into the cycle:

- "Add employees to cycle" calls `create_or_get_...` — the row already exists, so it returns `existing` and the status stays `excluded` (that's why your 22 codes all show *"skip: already in cycle"* / *"already excluded: 21"*).
- "Remove" and "Re-map" both refuse anything that isn't `not_started` / `pending_self`, so an excluded row is untouchable.
- A single-row `restore_annual_review_instance` RPC exists, but no bulk wrapper and no UI entry point.

## Fix — add a fourth bulk action: **Restore (re-include) to cycle**

### 1. New RPC — `bulk_restore_annual_review_instances(p_instance_ids uuid[], p_reason text)`
Mirrors `bulk_exclude_...`:
- HR/Admin gate, `auth.uid()` required, min-3-char reason, max 500 IDs, `SECURITY DEFINER`.
- For each instance: `FOR UPDATE`; skip if `overall_status <> 'excluded'` with message `not excluded: <status>`; otherwise set `overall_status='not_started'`, clear `excluded_at/by/reason`, bump `updated_at`.
- Per-row audit log `annual_review.instance.restored` + one summary `annual_review.bulk_action` with `kind='restore'`.
- `REVOKE ... FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated` (matches sibling RPCs).

### 2. Service — `src/services/annualReview/bulkAdmin.ts`
Add `bulkRestore(instanceIds, reason): Promise<BulkRestoreResult[]>` that calls the new RPC. Same shape as `bulkExclude`.

### 3. UI — `src/components/annual-review/BulkActionsTab.tsx`
- Extend `Action` union to `'add' | 'remove' | 'remap' | 'restore'`.
- Add `<SelectItem value="restore">Restore (re-include) to cycle</SelectItem>` after *Remove*.
- Show the **Reason** field for `restore` (min 3 chars, same as remove/remap).
- Preview "Will do" branch for `restore`:
  - no `employee_id` → `skip: not found`
  - no `instance_id` → `skip: no instance` (use *Add* instead)
  - `overall_status === 'excluded'` → `restore`
  - anything else → `skip: not excluded (<status>)`
- `canExecute` for restore: `preview.excluded.length > 0 && reason.trim().length >= 3`.
- Execute path: `bulkRestore(preview.excluded.map(r => r.instance_id!), reason)` → toast `Restored N employees`.
- Update the top hint copy: *"Remove and re-map only affect employees still in not_started/pending_self. Restore re-includes previously excluded employees. HR/Admin only."*

### 4. Optional convenience — Re-map after restore
Keep re-map's current guard (only `not_started`/`pending_self`). Since restore sets the row back to `not_started`, the same code list can be re-mapped in a second pass. No change needed to the re-map RPC.

### 5. Tests
- New unit test in `src/test/annualReview/bulkActions.test.ts`: preview classification for the four actions given a mix of statuses (excluded, not_started, pending_manager, missing instance, missing employee).
- RPC-level SQL smoke: excluded → restored; not-excluded → skipped with reason; non-admin → permission denied; empty array → no rows, no exception.

### Out of scope
- No changes to the resolver, exclusion history table, template overrides, or the single-row `excludeInstance` / `restoreInstance` used by the detail page.
- No auto-restore when re-mapping — remains an explicit two-step action to keep the audit trail clean.

### Risk
Low. Additive RPC + additive UI branch. Existing add/remove/remap paths untouched.
