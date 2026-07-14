## RCA — Prakash 200549 losing Dept Head stage

**What the UI shows:** timeline `Self Review → BU Head (Anil Pathak)`; Manager (Umesh) and Dept Head both bypassed.

**Instance state (`aaf74944…`):**
- `overall_status = pending_bu`
- `enabled_stages = ['self','bu_head']` ← dept_head missing
- `dept_head_id = NULL`
- `manager_id = adfab1e8` (Umesh) — but cycle's `default_enabled_stages` is `['self','dept_head','bu_head']`, so *manager* was never in the flow for this template. What the user really means by "Umesh" is the **Dept Head** stage.

**Timeline of the corruption**
1. **2026-07-11 12:09** — `annual_review.hierarchy_snapshot_repair` set `dept_head_id = Umesh (adfab1e8)`, `bu_head_id = b796a417`. Correct state.
2. Between 07-11 and 07-13 someone edited `departments.CLU-Elect.head_user_id` to **Prakash himself** (d634811b).
3. **2026-07-13 08:05** — the strict re-mapping sweep in migration `20260713080457` classified the row as `self_is_dept_head`:
   - NULLed `dept_head_id`,
   - stripped `'dept_head'` from `enabled_stages`,
   - kept status `pending_self` (later advanced to `pending_bu` when Prakash submitted).
4. Later, someone corrected `departments.CLU-Elect.head_user_id` back to **Umesh**. That fired `tg_cascade_department_head_change`, but:
   - the trigger's WHERE clause only touches `overall_status IN (not_started..pending_dept)` → skipped because instance was already `pending_bu`;
   - even for eligible rows the trigger has **no branch that re-adds `'dept_head'`** to `enabled_stages` when the new head is not self — it only removes it. Asymmetric.

Result: instance permanently stuck bypassing Dept Head. Same shape found for **8 other in-flight instances** (query confirmed).

## Fix plan

Three parts, delivered in one migration + docs.

### 1. Data repair (one-off, audit-logged)
Snapshot every instance where `dept_head` was dropped by a stale `self_is_dept_head` classification but the current `departments.head_user_id` is a **different active user**, then:
- restore `dept_head_id = departments.head_user_id`,
- re-add `'dept_head'` to `enabled_stages` (in canonical order: `self, dept_head, bu_head, hr`),
- if the instance is at `pending_bu` and no `dept_head` response was ever submitted → step back to `pending_dept` (dept must actually review). Instances at `pending_dept`/`pending_self`/etc. keep their status.
- Skip `completed`/`excluded` (immutability). If a wrong-person BU response exists, leave the response alone but still step back — the wrong response is preserved as history but the flow re-enters dept. Same pattern the July-13 migration used for `dept_head_changed`.
- Every changed row snapshotted into `annual_review_head_remap_audit_2026_07` with `classification = 'self_is_dept_head_reverted'` and a reason string referencing this RCA.

Same fix repeated for the symmetric `bu_head` case (any instance where bu_head was dropped by `self_is_bu_head` but the current BU head is now a different active person).

### 2. Trigger patch (permanent)
Rewrite `tg_cascade_department_head_change` and `tg_cascade_bu_head_change` so they are **symmetric**:

```
enabled_stages =
  CASE
    WHEN NEW.head_user_id = i.employee_id THEN  -- new head is self → drop
      strip 'dept_head'
    ELSE                                        -- new head is someone else → ensure present
      union('dept_head', existing) in canonical order
  END
```

Also widen the WHERE clause so a **valid head being restored** repairs `pending_bu`/`pending_hr` rows that had dept dropped and never actually reviewed (guarded: only step back when no `dept_head` response with `submitted_at IS NOT NULL` exists — mirrors the July-13 `dept_was_approved` guard). Symmetric change for `tg_cascade_bu_head_change`.

Canonical-order helper: inline `SELECT jsonb_agg(x ORDER BY array_position(ARRAY['self','manager','skip','dept_head','bu_head','hr'], x)) FROM (…) t(x)`.

### 3. Documentation
- `POLICY.md §AR-HEAD-MASTER-AUTHORITATIVE` — add sub-clause **AR-HEAD-CASCADE-SYMMETRIC** stating the trigger must add-and-remove, not remove-only.
- `DOCUMENTATION.md` version-history entry with the Prakash 200549 RCA and impacted-row count.
- `mem://features/annual-review/head-master-authoritative` — append note about symmetric cascade + `self_is_dept_head_reverted` audit classification.

### Technical section (SQL sketch)
```sql
-- one migration file, all inside a single transaction

-- (a) repair pass
WITH scoped AS (
  SELECT i.id, i.employee_id, i.overall_status::text AS old_status,
         i.dept_head_id AS old_dept, i.enabled_stages AS old_stages,
         d.head_user_id AS cfg_dept
  FROM annual_review_instances i
  JOIN profiles e ON e.id = i.employee_id AND e.is_active
  JOIN departments d ON d.id = e.department_id
  JOIN annual_review_cycles c ON c.id = i.cycle_id AND c.status IN ('open','active')
  WHERE i.overall_status NOT IN ('completed','excluded')
    AND d.head_user_id IS NOT NULL
    AND d.head_user_id <> i.employee_id
    AND (i.dept_head_id IS NULL OR NOT (i.enabled_stages ? 'dept_head'))
    AND (c.default_enabled_stages)::jsonb ? 'dept_head'
),
enriched AS (
  SELECT s.*,
    EXISTS (SELECT 1 FROM annual_review_responses r
             WHERE r.instance_id = s.id
               AND r.reviewer_role='dept_head'
               AND r.submitted_at IS NOT NULL) AS dept_was_approved,
    (SELECT jsonb_agg(x ORDER BY array_position(
              ARRAY['self','manager','skip','dept_head','bu_head','hr'], x))
       FROM (SELECT DISTINCT y AS x
               FROM (SELECT jsonb_array_elements_text(s.old_stages) y
                     UNION ALL SELECT 'dept_head') u) t) AS new_stages
  FROM scoped s
)
-- INSERT into audit … UPDATE instances SET dept_head_id, enabled_stages,
-- overall_status = CASE WHEN old_status='pending_bu' AND NOT dept_was_approved
--                       THEN 'pending_dept' ELSE old_status END::annual_review_status.

-- (b) symmetric trigger — see plan §2. CREATE OR REPLACE both functions.
```

### Impact & risk
- **Data impact:** 9 instances updated (1 Prakash + 8 siblings). Old snapshots archived to existing `annual_review_head_remap_audit_2026_07`. No `completed` rows touched.
- **Regression risk:** trigger now *adds* stages, so a legitimate `self_is_dept_head` still short-circuits correctly (the NEW.head_user_id = employee branch is unchanged). Because we only step back to `pending_dept` when there is no submitted dept response, we cannot silently overwrite a real approval.
- **Rollback:** archive rows carry `old_enabled_stages`, `old_overall_status`, `old_dept_head_id`. A revert can be composed from the audit table with a symmetric UPDATE.
- **Not in scope:** manager/skip stages — they were never part of this cycle's default; no request to add them.