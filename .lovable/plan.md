# RCA & CAPA — "not authorized to send notifications" on every KOI / KPI approval

## Reproduction (confirmed against live DB)

- Sender: `Shekhar Sharad` (`Auditor001`, role = `auditor`).
- Failing target from the toast: `a10d54cf-3329-4774-9b58-3c0dbd07052b` = **Rama Prasad Yadav (100627)**, role = `manager`.
- `public.can_send_notification_to(shekhar, rama)` returns **false**.
- Rama has KPIs, but **none** of Rama's KPIs sit in Shekhar's `audit_kpi_level_assignments` (0 rows in `audit_kpi_assignments`, 307 KPI-level rows spanning only 19 employees — Rama is not one of them).
- Shekhar can still legitimately open and approve Rama's KOI because of the **Auditor Access Expansion policy** (mem: `features/review/auditor-access-expansion`) — organizational auditors are allowed cross-check access beyond their formal assignments.

## 5-Why Analysis

1. **Why does the toast fire?** `notifications` RLS INSERT invokes `can_send_notification_to(sender, target)` which returns `false`, aborting the review-forward transaction.
2. **Why does the guard return false?** None of its branches match: Shekhar isn't admin/hr_pms/management, isn't in Rama's reporting chain, has no `audit_kpi_assignments` row for Rama, and none of Rama's KPIs appear in `audit_kpi_level_assignments` for Shekhar.
3. **Why can Shekhar act on the KPI at all then?** The Auditor Access Expansion (ADR / policy) lets any user with the `auditor` role review KPIs across the organisation without needing an explicit per-KPI or per-employee assignment row.
4. **Why didn't the notification guard follow the same expansion?** When ADR-112 rewrote `can_send_notification_to` (POLICY §108b), the auditor branch was modelled on the legacy per-assignment model only; the expansion policy was never mirrored into the guard.
5. **Why did this hit "all KOIs and all KPI pages" today?** Every auditor forward/approve path issues a notification to the next stage reviewer (manager / dept head / management / employee). Because the guard misses the expansion, essentially every downstream target that isn't in the tiny 19-employee assignment set is blocked — the failure is systemic for the auditor role, not one review.

## Root Cause (single sentence)

`public.can_send_notification_to` treats the `auditor` role as a per-assignment relationship, but the Auditor Access Expansion makes `auditor` an **operational global role** (like `admin` / `hr_pms`) — the guard is out of sync with the access policy that already governs the underlying review action.

## Risk & Impact Report

- **Data impact:** none. Function body rewrite only; no schema changes, no historical row edits.
- **Workflow impact:** auditors regain the ability to complete Send Back / Save Draft / Forward to Management / Raise Query on every KOI they are already allowed to open. No new privilege — RLS on `kpi_reviews`, `annual_review_*`, `kpi_queries` remains the authoritative write gate. The guard only decides *notification* delivery.
- **UI impact:** none.
- **Regression risk:**
  - Could an auditor spam arbitrary users? Only via the notification table, and only for review-context payloads the app actually emits — the app never lets auditors freely target arbitrary users; targets are always derived from the review record they are acting on.
  - Non-auditor paths (employee↔manager, HR, annual review, proxy submitter) branches are left untouched → no change to their behaviour.
- **Rollback:** single `CREATE OR REPLACE FUNCTION` — revert by re-issuing the ADR-112 body.

## CAPA — Corrective Action

Redefine `public.can_send_notification_to` with **one added line**: treat `has_role(sender, 'auditor')` the same as `admin` / `hr_pms` / `management` in the operational-sender allowlist. All other branches stay byte-identical to the current ADR-112 body (verified via `pg_get_functiondef`).

```sql
-- inside the operational-sender allowlist
IF public.has_role(sender, 'admin'::app_role)
   OR public.has_role(sender, 'hr_pms'::app_role)
   OR public.has_role(sender, 'management'::app_role)
   OR public.has_role(sender, 'auditor'::app_role)     -- NEW: mirror Auditor Access Expansion
   OR public.has_role(target, 'admin'::app_role)
   OR public.has_role(target, 'hr_pms'::app_role) THEN
  RETURN true;
END IF;
```

Everything below (hierarchy branch, per-assignment audit branch, annual-review branch, proxy-submitter branch) is preserved exactly. Function stays `STABLE SECURITY DEFINER` with `search_path=public`.

## CAPA — Preventive Actions

1. **POLICY.md §108d (Auditor-as-operational-sender):** Document that the notification guard mirrors the Auditor Access Expansion — any change to auditor scope must update both.
2. **ADR-113:** Log the decision and its coupling to `features/review/auditor-access-expansion`.
3. **Regression tests** (`src/tests/canSendNotificationToSchema.test.ts` — existing file):
   - `auditor → any active employee outside assignment set` returns `true`.
   - `auditor → manager (Rama Prasad case)` returns `true`.
   - Non-auditor → unrelated employee still returns `false` (no privilege leak).
   - Existing schema/`d.head_id` scanner assertions remain green.
4. **Live verification after migration:**
   - Re-run `SELECT public.can_send_notification_to('eddd5351-…','a10d54cf-…')` → expect `true`.
   - Ask Shekhar to retry Forward to Management on the same KOI; confirm no toast and that a `notifications` row is written to Rama.

## Implementation Steps (build mode)

1. Migration: `CREATE OR REPLACE FUNCTION public.can_send_notification_to(...)` with the single-line widen above.
2. Update `POLICY.md` (§108d) and `DOCUMENTATION.md` (Version History → v2.66.116).
3. Add `docs/adr/ADR-113.md`.
4. Extend `src/tests/canSendNotificationToSchema.test.ts` with the three new cases.
5. Verify live via `supabase--read_query` on the guard for Shekhar→Rama and one other unassigned employee.

## Not Applicable

UI changes, pagination, backup coverage, data lifecycle — this is a pure function-body correction.
