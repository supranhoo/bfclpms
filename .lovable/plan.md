## QA Pass + Smoke Test — Bulk Review Dashboard

### Assumptions
- `feature_bulk_review_dashboard` flag is ON for at least the logged-in admin (or admin bypass applies). If not, step 1 will surface that and we flip it before continuing.
- Smoke test will write real rows via `bulk_write_stage_scores`. To stay safe, we scope writes to a single throwaway employee × single KPI × current period, capture the prior state, and revert after.
- HR PMS users with `is_active = true` exist; otherwise the override-notification branch is a no-op and we'll mark that sub-check as N/A.

### Risk & Impact Report
- **Data Impact:** Low. One cell write at `auditor` stage on one KPI for one employee in the current period, captured & reverted via a follow-up `bulk_write_stage_scores` call restoring the original value (or NULL).
- **Workflow Impact:** None beyond that one cell; no status promotion if we keep the value identical to the existing auditor score (preferred path).
- **UI/UX:** Read-only inspection at 1364px (current viewport). No layout or token changes.
- **Regression Risk:** None — no code edits planned. If QA uncovers a bug, we stop and report before touching code.
- **Scalability:** Virtualization check uses whatever dataset the current period returns; if rows < 30, we note that virtualization can't be visibly stressed and rely on the implementation review already in memory.
- **Mitigation:** All writes idempotent and reverted; HR-PMS notification check uses `metadata->>'batch_id'` lookup so we can clean up the test notification afterward.

### Plan

```text
1. Preview load & feature flag    →  navigate to /review/bulk-scoring, screenshot, confirm grid renders
2. Virtualized grid sanity        →  sticky header, scroll, selection, variance badges, column count = 9
3. Drawer + RPC happy path        →  open BulkCellDrawer on a non-empty cell, confirm read fields
4. Smoke write (idempotent)       →  call bulk_write_stage_scores with stage=auditor, value=existing score, 1 cell
5. HR-PMS override notification   →  inspect notifications table for type='auditor_override_of_hr' tied to batch_id
6. Cleanup                        →  revert the cell write if value changed; delete the test notification row(s)
7. Report                         →  list pass/fail per check, capture any console errors, update memory log
```

### UI Changes
Not Applicable — QA only.

### Technical Details
- **Tools used:** `browser--navigate_to_sandbox` → `browser--screenshot` / `browser--observe` for UI checks; `supabase--read_query` to pick a safe target cell, snapshot existing state, and verify notifications; `supabase--insert` (only if cleanup needs UPDATE/DELETE — otherwise a second `bulk_write_stage_scores` call handles revert).
- **Target selection query (read-only preview):**
  ```sql
  select rh.id, rh.profile_id, rh.kpi_name, rh.period, rh.year,
         rh.auditor_score, rh.hr_pms_score
  from public.review_history rh
  where rh.auditor_score is not null
    and rh.status = 'auditor'
    and rh.period = (select period from public.review_periods where is_current = true limit 1)
  limit 1;
  ```
- **Smoke RPC call** uses identical `auditor_score` value → no state change, just exercises the write path & notification branch.
- **Notification verification:**
  ```sql
  select id, user_id, type, metadata
  from public.notifications
  where type = 'auditor_override_of_hr'
    and metadata->>'batch_id' = '<batch_from_rpc_response>';
  ```

### Tests
Not Applicable for this QA loop — option 3 (unit tests + mock data) was offered separately and not selected. If smoke test fails, I'll stop and we'll add unit tests as part of the fix.

### DOCUMENTATION.md / POLICY.md updates
Not Applicable — no behavior change. Memory log already reflects shipped state.

### Post-implementation notes
After the run I'll report:
- ✅/❌ per check
- Any console or network errors
- Whether HR-PMS notification fired (or N/A if no active HR PMS users)
- Confirmation that test data was reverted

### Rollback Strategy
No code changes → nothing to roll back. Data side: cleanup step restores the cell and deletes the test notification, both gated on the captured `batch_id`.

Approve to switch to build mode and execute the QA pass.