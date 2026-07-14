# RCA & CAPA — Auditor Shekhar Sarodha error

## Reported Symptom
On submitting an audit review (Forward to Management), the UI shows:
`Failed to submit review — column "action_type" of relation "kpi_audit_logs" does not exist`

## 5-Why Analysis
1. **Why did the submit fail?** Postgres aborted the transaction with `column "action_type" of relation "kpi_audit_logs" does not exist`.
2. **Why did that column not exist?** The `public.kpi_audit_logs` table exposes `action` and `metadata` — never `action_type`/`remarks`.
3. **Why was `action_type` referenced then?** The trigger function `public.percolate_multimonth_score` (attached as `trg_percolate_multimonth_score` on `public.kpis`) inserts into `kpi_audit_logs` with `(kpi_id, action_type, performed_by, old_value, new_value, remarks)`.
4. **Why did that trigger fire for Shekhar's KPI?** The KPI is a multi-month cadence (Bi-Monthly/Quarterly/Half-Yearly/Yearly) at its terminal month. `resolveForwardStatus('auditor', …)` resolved to `approved` because auditor is the terminal reviewer in this employee's workflow, so `kpis.status` moved to `approved` and the percolate trigger executed for the first time on this record.
5. **Why did the schema and trigger diverge?** The trigger's INSERT statement was authored against an older draft column vocabulary (`action_type`, `remarks`) and never updated when the table was standardised on `action`/`metadata` (per ADR/mem `kpi-audit-logs-canonical`). No regression test asserted the trigger's column list against the live table.

## Root Cause
Column-name drift inside `public.percolate_multimonth_score`. All other writers (client hooks, other triggers, edge functions) already use the canonical `(kpi_id, action, performed_by, old_value, new_value, metadata)` shape; this one function was missed.

## Impact
- Every auditor "Forward to Management" (or any path that promotes a terminal-month multi-month KPI to `approved`) fails for the affected frequencies.
- No data corruption — transaction rolls back atomically; submission, KPI status, and audit log are all untouched.
- Single-month (Monthly / Daily / Weekly) KPIs are unaffected because the trigger returns early for them.

## CAPA

### Corrective (this fix)
Migration that redefines `public.percolate_multimonth_score` with:
- `action_type` → `action`
- `remarks` → folded into the `metadata` JSONB as `metadata.note`
- Column list becomes `(kpi_id, action, performed_by, old_value, new_value, metadata)` — matches the canonical vocabulary in `mem/architecture/database/kpi-audit-logs-canonical`.
- Action literal stays `'SCORE_PERCOLATED'` (already recognised by the timeline grouper).
- No other trigger body, no RLS, no policy, no downstream consumer changes.

### Preventive
1. **Regression test** (`src/test/percolateMultimonthAuditColumns.test.ts`) that greps the latest `percolate_multimonth_score` migration and asserts:
   - zero occurrences of `action_type` and `remarks` as column names in that INSERT,
   - the canonical `(kpi_id, action, performed_by, old_value, new_value, metadata)` tuple is present.
2. **Verification query** (post-migration, run via existing linter): scan `pg_proc.prosrc` for any function in `public` that still references `action_type` in an `INSERT INTO … kpi_audit_logs` block — expected empty. Documented in POLICY.md under §104 (kpi_audit_logs canonical).
3. **Ask Shekhar to retry the same KPI** — the fix is idempotent and the previous failed attempts rolled back cleanly, so no data repair is required.

## Risk & Impact Report
- **Data:** None — function body only; no schema, no historical rewrite.
- **Workflow:** Restores the previously-broken auditor→approved path for multi-month terminal months. All other paths untouched.
- **UI/UX:** None.
- **Regression risk:** Very low. The only other functions naming `action_type` are `log_standardization_action` / `reverse_standardization_action` (a *different* table `kpi_standardization_actions` where `action_type` is a legitimate column) and a one-off `correct_may_kpis` fixture — none touched by this migration.
- **Rollback:** Re-deploying the previous function definition restores prior (broken) behaviour; forward-only fix is safe.

## Deliverables
1. Migration: `CREATE OR REPLACE FUNCTION public.percolate_multimonth_score()` with the canonical column names.
2. Vitest guard: `src/test/percolateMultimonthAuditColumns.test.ts`.
3. Changelog note (`.lovable/plan.md`) recording RCA + CAPA reference.

No client-side code changes.
