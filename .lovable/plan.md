## Force Reset & Swap Template (destructive)

Extend the existing "Move already-seeded employees" flow so admins can also move employees whose instances are past `pending_self`, by wiping their prior responses and restarting the instance on the new template.

### Behavior
- Rows currently marked **Skipped (past self stage)** get a new action toggle: **"Force reset"** (per row) plus a bulk **"Include locked (reset & swap)"** checkbox in the dialog footer.
- Force-reset destroys the instance's answers on the old template and restarts it as `pending_self` on the new template.
- Old data is preserved in an audit table (never truly lost), but the employee's live form starts blank.
- Non-destructive reassign of `not_started`/`pending_self` rows continues to work as-is.

### UX changes (`SyncAssignmentsDialog.tsx`)
```
[ Table row past self stage ]
  Action column: [ Force reset ▢ ]  (unchecked by default)
[ Footer ]
  ▢ Include locked instances (destructive reset)
  When any locked row is checked → footer badge turns red:
    "N will move · M will be reset (destructive)"
[ Primary button ]
  If M > 0: label becomes  "Reset M & reassign N now"  (destructive variant)
  Click → second confirm AlertDialog:
    Title:  "Destroy M submitted self-reviews?"
    Body:   Lists count + names of the M employees whose responses will be wiped.
            Input: reason (≥10 chars, required).
            Text-to-confirm: user must type RESET to enable the final button.
    Final button: "Reset & reassign" (destructive).
```
- The "Reason" typed in the second confirm is passed to both RPCs (override + reset) so every audit row shares the same justification string.
- Only visible to `admin` and `hr_pms` (matches existing override RPC guard).

### Backend

New RPC `force_reset_annual_review_instance(p_instance_id uuid, p_new_template_id uuid, p_reason text)`:
- `SECURITY DEFINER`, `SET search_path = public`.
- Guard: caller must be `admin` or `hr_pms`; reason length ≥ 10; instance must exist and not be `finalized`/`closed` (finalized reviews stay immutable — separate rollback path).
- Steps in one transaction:
  1. Snapshot the instance + all `annual_review_responses` + all `annual_review_proxy_submissions` into a new archive table `annual_review_reset_archive` (JSONB payload + reset_by, reset_at, reason, prior_status).
  2. `DELETE` those response/proxy rows for the instance.
  3. `UPDATE annual_review_instances SET template_id = p_new_template_id, template_override_id = NULL, overall_status = 'pending_self', current_stage_role = 'self', submitted_self_at = NULL, submitted_manager_at = NULL, ... (clear every stage timestamp), is_locked = false WHERE id = p_instance_id`.
  4. Insert `system_audit_logs` row `annual_review.instance_force_reset` with { instance_id, employee_id, prior_template_id, new_template_id, prior_status, wiped_response_count, reason }.
  5. Return `{ archived_response_count, prior_status, new_status: 'pending_self' }`.

New RPC `bulk_force_reset_annual_review_instances(p_items jsonb, p_reason text)`:
- Accepts `[{instance_id, new_template_id}, …]`, iterates, aggregates results `{ succeeded, failed:[{instance_id, error}] }`. Same auth as above.

New table `annual_review_reset_archive` (schema section below) with RLS.

### Frontend service layer
`src/services/annualReview/formMapping.ts` (or new `forceResetInstance.ts`):
- `forceResetAnnualReviewInstance(instanceId, newTemplateId, reason)`
- `bulkForceResetAnnualReviewInstances(items, reason)`

`SyncAssignmentsDialog.tsx`: add per-row checkbox state for force-reset, bulk toggle, second confirm sub-dialog with RESET text gate, wire onConfirm to call BOTH the existing bulk override RPC (for eligible rows) AND the new bulk force-reset RPC (for checked locked rows), then combine toast counts.

`SeededConflict` type: add optional `force_reset_selected?: boolean` (client-side only) so the parent page can compute counts.

### Database section (technical)
```sql
CREATE TABLE public.annual_review_reset_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  prior_template_id uuid,
  new_template_id uuid NOT NULL,
  prior_status text NOT NULL,
  wiped_responses jsonb NOT NULL,     -- full snapshot of deleted response rows
  wiped_proxy_submissions jsonb,       -- if any
  reason text NOT NULL,
  reset_by uuid NOT NULL REFERENCES auth.users(id),
  reset_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.annual_review_reset_archive TO authenticated;
GRANT ALL   ON public.annual_review_reset_archive TO service_role;
ALTER TABLE public.annual_review_reset_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_hr_read_reset_archive"
  ON public.annual_review_reset_archive FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
-- No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER RPCs can write.
```
Both new RPCs `SECURITY DEFINER`, `SET search_path = public`, granted to `authenticated` (auth gate is inside).

### Guardrails
- `finalized` / `closed` instances are always rejected server-side, even if UI passes them (defence in depth).
- Reason < 10 chars → server rejects.
- Reset writes both a `system_audit_logs` entry AND an `annual_review_reset_archive` row; either failure rolls back the delete/update in the same tx.

### Docs
Update `src/modules/annual-review/DOCUMENTATION.md` and `POLICY.md`:
- New section "Force reset & template swap".
- Version-history entry.

### Not in scope
- Rolling back a force-reset from the UI (archive table is read-only viewer only; restore is a follow-up if needed).
- Force-moving finalized/closed reviews (explicitly blocked).
- Notifying the employee automatically (existing notification engine will pick up the new `pending_self` state; no extra wiring here).