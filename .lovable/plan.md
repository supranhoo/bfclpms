# RCA — Wrong Dept Head on Akhay Kumar Maity (101796)

## Master data (confirmed correct)
```
Akhay Kumar Maity (101796)
  └─ reporting_manager → Prabhat Kumar Singh (101757)
                            └─ reporting_manager → Sajid Raza (100264, BU Head)

Department: 1050 TPD-Mech
  └─ head_user_id → Sushanta Ghosh (101883)   ← correct Dept Head
```

## What the review instance actually stores
`annual_review_instances` row `f691746e-58a6-435c-bce7-11003050fab0`:

| Column | Stored | Expected |
|---|---|---|
| manager_id   | Sudhir Kumar (101894) ❌ | Prabhat Kumar Singh (101757) |
| skip_id      | Prabhat Kumar Singh ❌   | Sajid Raza (100264) |
| dept_head_id | Sudhir Kumar (101894) ❌ | Sushanta Ghosh (101883) |
| bu_head_id   | Sajid Raza ✓             | Sajid Raza |

Row created 2026-07-06, last touched 2026-07-11 — **before** the master hierarchy for Akhay was corrected. The dept-head shown in the UI comes straight from `dept_head_id` on this row.

## Root cause
Reviewer routing (`manager_id / skip_id / dept_head_id / bu_head_id / hr_id`) is **snapshotted at seed time** by `annualReviewService.buildSeedUpdatePatch` + `hierarchyGuard.resolveHierarchicalHead`. This is deliberate — it protects an in-flight review from silently swapping reviewers mid-stage.

Trade-off: when `profiles.reporting_manager_id` or `departments.head_user_id` is corrected **after** an instance is seeded, the instance keeps the stale chain until an admin re-runs the seeder for that cycle. Akhay's instance has not been resnapshotted since the master was corrected, so it still points at Sudhir.

`hierarchyGuard` itself is behaving correctly — given the current master it would resolve Dept Head = Sushanta Ghosh. Sudhir only appears because he was the manager stamped when the row was first written.

## Fix — two parts

### Part A — one-off data repair for the affected cycle
Re-run the existing update-only seeder path (`writeSeedRowsPreservingOverrides`) for Akhay's cycle. This routes every instance through `buildSeedUpdatePatch`, which resolves each reviewer column against the current master.

- Scope: reviewer routing columns only. Scores, submissions, evidence, workflow status untouched. POLICY §88 (submission snapshot immutability) covers *scores*, not reviewer identity.
- Safety: skip instances already past the `dept_head` stage so we never move a reviewer out from under an open action.
- Verification: re-run the RCA SELECT and confirm `manager_id → Prabhat`, `skip_id → Sajid`, `dept_head_id → Sushanta`.
- Rollback: snapshot the affected rows into a temp table before update; restore from it if anything looks off.

### Part B — prevent recurrence
Add an admin-visible **"Resync reviewers from master"** action on the Annual Review cycle admin screen. It calls the same `writeSeedRowsPreservingOverrides` path for the current cycle, scoped to instances not yet past the affected stage. No schema change, no new table.

Optional follow-up (not in this plan unless you ask): nightly scheduled resync of pre-stage instances.

## Risk & impact
- **Data:** touches reviewer routing columns on annual review instances only. No score, workflow, or evidence mutation.
- **Workflow:** an instance that has already advanced past a given stage is skipped for that stage's column, so no reviewer swap mid-flight.
- **UI/UX:** one new admin button. No layout, responsiveness, or navigation change.
- **Regression:** low — reuses the existing seeder code path already covered by `seedUpdatePatch.test.ts` and `hierarchyGuard.test.ts`.
- **Scalability:** update is per-cycle, per-instance (existing chunked loop, ~few hundred ms per 100 rows). Fine for BFCL cycle sizes.

## Tests
- Extend `src/test/annualReview/seedUpdatePatch.test.ts` with Akhay's exact shape: previously-snapshotted wrong dept head + peer configured as head → patch must resolve to `departments.head_user_id` (Sushanta), not the stale manager.
- Extend `src/test/annualReview/hierarchyGuard.test.ts`: when a valid `departments.head_user_id` exists, it must win over a stale manager fallback.
- Guard the "skip past-stage instances" rule with a new unit test on the resync helper.

## Docs
- `DOCUMENTATION.md` → Annual Review › Reviewer Snapshotting: document the "snapshot at seed, resync via admin action" contract.
- `POLICY.md` → new clause `§AR-REVIEWER-RESYNC`: resync is allowed only for instances not yet past the affected stage; scores are never touched.
- Add ADR entry summarising this decision (short — one page).

## Not applicable
- Backup / retention (no new tables).
- RLS (no new tables or policies).
- Pagination (existing chunked seeder already handles this).
