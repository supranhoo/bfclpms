1. Assumptions
- The current failure is the same one shown in logs: `constraint "idx_kpis_no_duplicates" for table "kpis" does not exist`.
- The unique duplicate protection exists as a unique index, not a table constraint.
- Manual rollover and scheduled rollover both use the same `auto-rollover-kpis` function and the same `batch_insert_kpis_with_rollover_flag` database RPC.

2. Clarifications
- Not Applicable. The root cause is visible from backend function logs and database metadata.

3. Risk & Impact Report
- Data Impact: No schema/table data deletion. The fix will only replace the KPI batch-insert RPC so duplicates are ignored using the existing unique index expression.
- Workflow Impact: Manual and scheduler rollover should stop failing when duplicate KPIs already exist; duplicate KPI prevention remains active.
- UI/UX Impact: No UI layout or route changes. Existing failure/success toast behavior remains.
- Regression Risk: Low-to-medium because the change is in a shared insert path for rollover. Main risk is conflict-target syntax mismatch with the existing unique index.
- Scalability Impact: Batch size remains unchanged; no extra full-table scans are introduced. Existing unique index continues to handle duplicate checks efficiently.
- Mitigation Plan: Use a minimal migration, validate the RPC with the actual index definition, add/adjust a regression test for duplicate-skipping behavior, and update documentation/policy notes.
- Rollback Strategy: Revert the RPC body to the previous implementation if needed; no destructive data migration is involved.

4. Step-by-step Plan
1. Replace the database RPC `public.batch_insert_kpis_with_rollover_flag` in a new migration.
   - Change `ON CONFLICT ON CONSTRAINT idx_kpis_no_duplicates DO NOTHING` to an expression conflict target matching the existing unique index:
     ```sql
     ON CONFLICT (
       employee_id,
       (COALESCE(review_period, ''::text)),
       (COALESCE(review_year, 0)),
       kra_name,
       kpi_name
     ) DO NOTHING
     ```
   - This fixes the root cause because `idx_kpis_no_duplicates` is an index, not a constraint.
2. Update `supabase/functions/auto-rollover-kpis/index.ts` comments/error context only if needed so the source no longer documents the incorrect `ON CONSTRAINT` behavior.
3. Add/adjust regression coverage for rollover duplicate skipping so future changes don’t reintroduce a hard failure on pre-existing KPIs.
4. Update `DOCUMENTATION.md` version history with the rollover idempotency correction.
5. Update `POLICY.md` only if it exists/relevant, noting that rollover must be idempotent and preserve duplicate-prevention rules.
6. Validate by checking backend logs/function behavior after migration approval.

5. UI Changes
- Not Applicable. No visual changes are required.

6. Implementation
- Pending your approval to switch from plan to implementation.

7. Tests
- Add/adjust a focused test around duplicate rollover behavior and the expected skipped-duplicate outcome.
- Do not run broad builds manually; run targeted tests only if applicable.

8. DOCUMENTATION.md updates
- Add a concise version-history entry: KRA rollover duplicate handling fixed by matching the RPC conflict target to the actual unique index.

9. POLICY.md updates
- If present, add/adjust the policy note that KRA rollover is idempotent: existing employee/period/KRA/KPI rows must be skipped, not treated as fatal errors.

10. Post-implementation notes
- After implementation, I’ll confirm the specific backend error no longer appears and report the exact validation performed.