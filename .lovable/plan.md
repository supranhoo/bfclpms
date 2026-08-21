# Fix: deleting a duplicate business unit / department is blocked with no explanation

## What actually happened (verified)

You tried to delete the business unit **HR-HUMAN RESOURCES** (a duplicate of **HR**). The dialog showed no blockers, but the delete failed with a foreign-key error.

Verified in the database:

- HR-HUMAN RESOURCES has no employees, no KPIs, no targets of its own.
- It has **3 access-profile visibility rows** (safely cleanable) and **1 child department: "Executive"** (cascade-deleted with the BU).
- That child department "Executive" is itself still referenced by **2 organisational KPI values** (Feb-2026 and Mar-2026 "Adherence to Manning Norms", status `propagated`) and **3 access-profile visibility rows** — under RESTRICT foreign keys.

So the cascade tries to delete "Executive", that delete is refused, and the whole thing rolls back.

## Root cause

The ADR-308 dependency preflight only walks foreign keys pointing **directly** at the record being deleted. It does not follow cascade children and check *their* dependencies. A record can therefore look clean while a cascaded child is blocked, which is exactly the case here.

## Five whys

1. Delete failed — a RESTRICT foreign key was violated.
2. Which one — `org_kpi_values.department_id` (and access-profile scope) on the child department "Executive".
3. Why wasn't it shown — the impact report ignores cascade descendants.
4. Why — the report was written for the single-level CLU case (division → access profile scope).
5. Why no safety net — the guard trusted its own single-level report, so the database error was the only feedback.

## Fix

1. **Recursive impact report** — make `org_master_delete_impact` walk cascade (`CASCADE` / `SET NULL`) children recursively, so dependencies of "Executive" appear as dependencies of the BU, labelled with the child they belong to ("via department Executive"). Cycle-safe, depth-capped.
2. **Guard uses the same recursive view** — blocking descendants abort before any delete is attempted; cleanable descendants (access-profile scope) are cleared in the same transaction when the cleanup box is ticked; audit row records everything cleaned, including descendants.
3. **Honest dialog** — the delete dialog lists, in plain language: "Deleting this also removes the department Executive" and, under it, what still blocks it ("2 organisational KPI values for Feb-2026 and Mar-2026"). Delete stays disabled while blockers exist.
4. **Actionable next step for this record** — the two KPI values are real data, so they are not auto-deleted. The dialog names the exact months and KPI so you can move them to the correct HR department (or clear them) from the Performance Console, after which the BU deletes cleanly.

## Technical notes

- Migration replaces `org_master_delete_impact` with a recursive CTE-driven walk over `pg_constraint`, returning an extra `via_path text` column; `org_master_delete` consumes the same function unchanged in signature.
- Client: `src/services/organization/orgMasterDelete.ts` gains `via_path` in `OrgDeleteImpactRow` plus label rendering; `src/pages/admin/Organization.tsx` groups impact rows by `via_path`.
- Tests extended in `src/test/orgMasterDelete.test.ts`: the HR-HUMAN RESOURCES shape (cascade child with blocking grandchildren) must classify as blocking, and the recursive walk must be asserted in the migration contract test.
- Docs: ADR-308 amendment (v2.66.308a) plus POLICY §ORG-MASTER-DELETE-DEPENDENCY-GUARD update.

## Risk

Additive: no constraint is loosened, nothing new is auto-deleted. The recursive report is stricter than today, so some records that previously appeared deletable will now be correctly reported as blocked before failing.
