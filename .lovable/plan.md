
## Addendum: One-time Backfill Tool — Recover Missing Employees from Past Imports

Adds a **one-time recovery utility** to the existing import-RCA plan so the admin does NOT have to re-upload the master file.

### Goal
Reconcile `profiles` against every employee row that ever passed through the system (via prior import attempts, audit logs, or attached source files) and **insert the missing ones automatically** — preserving all their attributes (designation, dept, BU, level, location, manager, etc.).

### Sources of truth to pull from (in priority order)
1. **`import_audit_logs`** (or equivalent table that captures the raw payload of each import run) — contains the full row data of every attempted import, including rows that were rejected/skipped silently.
2. **Most recent uploaded master file** retained in storage (if the importer archives uploads) — re-parsed server-side.
3. **Admin-supplied file fallback** — single drag-drop in the recovery dialog if neither (1) nor (2) yields enough rows.

The backfill script reconciles candidates by normalized `employee_code` (`upper(trim(...))`) against current `profiles` and produces three buckets: **already present · safe to insert · conflict (needs review)**.

### New one-time admin tool

**Page:** `Admin → System Settings → Data Repair → Employee Master Backfill`
**Files:**
- `src/pages/admin/EmployeeMasterBackfill.tsx` (new) — lists candidates, shows diff, lets admin pick "Insert all safe" or row-by-row.
- `supabase/functions/backfill-employee-master/index.ts` (new, admin-gated) — does the heavy lifting server-side: pull → normalize → reconcile → batched insert with per-row error capture.

**Flow:**
1. Admin opens the page → function runs in **dry-run mode**, returns: *Total candidates: N · Already in DB: X · Will insert: Y · Conflicts: Z*.
2. Admin reviews the table (employee_code, name, dept, BU, location, source row #, why it was missed).
3. Admin clicks **"Run Backfill"** → confirmation dialog (per `ConfirmDestructiveDialog` policy) → server inserts in batches of 100 with full per-row try/catch.
4. Final summary dialog (reuses the new `ImportSummaryDialog` from the prior plan): *Inserted: Y · Failed: F (downloadable error report)*.
5. Result is logged to `import_audit_logs` with `source = 'one_time_backfill'` and `performed_by = <admin user>`.

### Safety & guardrails
- **Idempotent**: re-running after success is a no-op (all rows already present).
- **Read-then-decide**: never overwrites existing profiles — backfill is **insert-only**. Updates to existing rows still go through the normal import path (per the prior auto-update plan).
- **Master-data soft-resolve**: if a candidate's `department` / `business_unit` / `location` doesn't resolve, insert with that FK = NULL and flag the row in the summary so admin can fix masters later. No row is silently dropped.
- **Auth**: edge function uses the shared `requireAdminUser` helper (admin-only).
- **Audit trail**: every inserted profile gets an `import_audit_logs` entry with source = `one_time_backfill` and the originating run-id for traceability.

### SSOT sync
- `DOCUMENTATION.md` Version History: *"One-time Employee Master Backfill tool added under Data Repair to recover ~1,100 historically-missed profiles without requiring re-upload."*
- `POLICY.md` Data Repair section: *"Backfill is insert-only, idempotent, admin-only, and fully audit-logged."*
- `mem://features/admin/data-repair-engine`: append the backfill workflow.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | Insert-only. ~1,100 new `profiles` rows expected. Zero modification of existing 895. |
| Workflow | After backfill, dashboards / KPI matrix / incentive enrollment will reflect the full org automatically. |
| UI/UX | One new admin page + reuses existing summary dialog. |
| Regression | Very low. Tool is gated behind admin role and a confirmation dialog; idempotent on re-run. |
| Mitigation | Dry-run preview before any write; per-row error capture; downloadable error report; full audit log. |

### Files Touched (delta)
- new: `src/pages/admin/EmployeeMasterBackfill.tsx`
- new: `supabase/functions/backfill-employee-master/index.ts`
- `src/pages/admin/SystemSettings.tsx` (or Data Repair index) — add tile/link
- `DOCUMENTATION.md`, `POLICY.md`, `mem://features/admin/data-repair-engine`

### Out of Scope
- Auto-running the backfill on a schedule (one-time, manual trigger only).
- Backfilling KPI / score history (employees only — KPI data still requires its own import run after profiles exist).
- Touching the existing import pipeline beyond what's already in the prior plan.

### Question before implementation
To make the dry-run accurate on the first try: does the project currently retain (a) raw payloads in `import_audit_logs`, or (b) the original uploaded XLSX files in storage? If neither, the recovery tool will fall back to a single drag-drop where the admin uploads the master file once and the tool runs the full reconcile + insert flow against it (still no manual re-import needed beyond that one drop).
