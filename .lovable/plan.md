
## What the user is seeing

Audit Review sheet, Enhance Campaign Life (Higher-is-Better, R5=60):

- Self card shows **Value: 38, Rating: 5**
- Banner: *"System Auto-Advanced — Scored by Admin on behalf of self"*
- Timeline / KPI History clearly show the value was later updated (rating 5 requires achieved ≥ 60)

The rating is correct. The **displayed value is stale**.

---

## Root Cause Analysis (5 Whys)

1. **Why does the Self card show 38 while rating is 5?**
   `ReviewStageCard` renders the value resolved by `resolveSelfAchievedValue(submission, kpi)` (`src/lib/review/resolveSelfAchievedValue.ts`). Its very first branch is: *if `review_submissions.self_achieved_value` is not null, return it as `pristine`*. That column holds `38`.

2. **Why does `self_achieved_value` hold 38 when `self_score`/`self_rating` were updated to reflect a much higher achievement?**
   The row was created by an auto-advance stub that captured 38. An Admin later corrected the self value using **Admin Data Entry → Self** (`useAdminSubmitReviewData` in `src/hooks/useAdminDataEntry.ts`). That path wrote the new value into the **shared** `achieved_value` column and refreshed `self_score` / `self_rating`, but it **never mirrored the new value into `self_achieved_value`**.

3. **Why doesn't Admin Data Entry mirror to `self_achieved_value`?**
   `buildUpdateFields()` (lines 55–94) hardcodes: for `role_level === 'self'` write only `achieved_value` (no `self_achieved_value`). The column was introduced in Part 2 (ADR-088, June 2026) as a *frozen snapshot* written only by `submit_self_review` RPC and `propagate_org_kpi_value`. Admin Data Entry pre-dated the column and was never updated.

4. **Why didn't the §88.5 stub-refresh path in `propagate_org_kpi_value` fix it either?**
   That refresh is gated on `auto_advance_reason IS NOT NULL AND final_score IS NULL AND no self_evidence_url(s)`. This row has a **Self Evidence attachment** (visible as "Evidence" on the Self card), so the stub-refresh is intentionally skipped — the row is now considered "human-owned". Once Admin Data Entry ran, it should have kept the snapshot in sync itself.

5. **Why did this design gap survive?**
   `self_achieved_value` is a *write-once* invariant for **reviewer-stage RPCs** (correctly — auditor/manager must not mutate the self snapshot), but the same rule was over-applied to **self-owning writers**. There is no source-level guard that says: *"every writer whose `role_level === 'self'` MUST update `self_achieved_value` whenever it updates `achieved_value` or `self_score`."* So the omission is invisible to typecheck and tests.

**Root cause (one line):** Admin Data Entry (role_level=self) writes `achieved_value` but not the frozen `self_achieved_value` snapshot, and the Self card resolver prefers `self_achieved_value` — result: stale display.

---

## Additional writers to audit for the same bug

- `useAdminSubmitReviewData` (`src/hooks/useAdminDataEntry.ts`) — **confirmed missing mirror**.
- Admin override / edit dialogs that call `review_submissions.update({ achieved_value: … })` for a self-owned row. `rg "achieved_value:" src` and inspect any hit that runs when the acting role is Self / Admin-on-behalf-of-Self.
- `ReviewLevelOverrideEditor`, `ManagerDailyOverrideEditor` — read only, but confirm they don't write `achieved_value` while acting as self.
- Any bulk RPC that stamps `achieved_value` for the self row (search `bulk_*` in migrations).

---

## CAPA

### Corrective (fix the incident + backfill)

1. **Patch `useAdminSubmitReviewData`** — in `buildUpdateFields`, when `role_level === 'self'` and `data.achieved_value !== undefined`, also set `fields.self_achieved_value = data.achieved_value`. On explicit N/A (self), also null `self_achieved_value` alongside `achieved_value`.
2. **Data backfill migration** — one-shot repair: for every `review_submissions` row where `self_achieved_value IS DISTINCT FROM achieved_value` AND the latest audit-log event for that row is `ADMIN_DATA_ENTRY_SELF` (or `ADMIN_OVERRIDE` mutating `achieved_value` on a self-owned row), set `self_achieved_value = achieved_value`. Write a `KPI_AUDIT_LOG` row per fix with `action = 'SELF_SNAPSHOT_RESYNC'`, `performed_by = NULL`, `metadata.policy = '§88 CAPA-2026-07'`. Verify the specific KPI in the screenshot (Enhance Campaign Life, Sajid Raza, Jun 2026) refreshes to the true value.
3. **UI safety net** — in `resolveSelfAchievedValue`, when `self_achieved_value` is non-null but recomputing its rating from the current KPI thresholds does NOT match `self_score`, treat it as stale: prefer `achieved_value` if that matches `self_score`, else fall through to the recovery logic. This prevents any future writer omission from silently rendering a stale number.

### Preventive (make the class of bug unrepresentable)

4. **DB trigger `enforce_self_snapshot_mirror` on `review_submissions`** — on UPDATE, if `NEW.achieved_value IS DISTINCT FROM OLD.achieved_value` AND the update did NOT set `self_achieved_value` explicitly AND the change is attributed to a self-owning action (admin_data_entry_self, admin_override on self, self_submit), auto-set `NEW.self_achieved_value := NEW.achieved_value`. Reviewer-stage writes remain untouched (they update `<stage>_achieved_value`, not the shared column).
5. **Source-level guard test** — add `src/test/adminDataEntrySelfSnapshotMirror.test.ts` that greps `useAdminDataEntry.ts` for `role_level === 'self'` branches and asserts every `achieved_value` write is paired with a `self_achieved_value` write. Mirrors the pattern of `bulkWriteStageScoresAchievedMirror.test.ts` (§88.1.d / ADR-098).
6. **Docs & policy** —
   - New ADR: *"Self-owning writers MUST mirror `self_achieved_value`; reviewer-stage writers MUST NOT touch it."*
   - POLICY §88.6: enumerate the full list of self-owning writers, cross-linked from the resolver comment.
   - Update `mem/features/review/self-snapshot-display.md` to lift the "still out of scope" caveat.

### Detective (catch regressions early)

7. **Nightly integrity check** (extend `data-integrity-sweep` edge function or add a small cron): flag rows where `self_score IS NOT NULL` AND `self_achieved_value IS NOT NULL` AND recomputed rating from `self_achieved_value` ≠ `self_score`. Post to admin diagnostics dashboard.

---

## Risk & Impact Report

- **Data impact:** Additive column write only; backfill is idempotent and audit-logged. No score, rating, or final_score is changed — only the display snapshot is realigned. Historical `final_score` rows are untouched (POLICY §88 immutability preserved).
- **Workflow impact:** None. No status transitions, no notifications.
- **UI impact:** Self card will now show the correct (updated) value on affected rows. No layout change. `autoAdvancedResyncHint` italic line already handled separately.
- **Regression risk:** Low. Reviewer-stage cards read `<stage>_achieved_value` — unaffected. Employee `submit_self_review` RPC already writes both columns — unaffected. The new DB trigger is scoped to self-attributed updates via metadata check to avoid firing on reviewer bulk paths.
- **Scalability:** Backfill is a single UPDATE with a bounded WHERE clause; nightly integrity check is a lightweight aggregate.
- **Rollback:** Frontend patch is a 2-line revert. DB trigger is `DROP TRIGGER`. Backfill inverse is derivable from the `SELF_SNAPSHOT_RESYNC` audit rows.

---

## Files to touch (build phase)

- `src/hooks/useAdminDataEntry.ts` — mirror write in `buildUpdateFields`.
- `src/lib/review/resolveSelfAchievedValue.ts` — stale-detection guard.
- `supabase/migrations/<ts>_self_snapshot_mirror_capa.sql` — backfill + trigger + audit rows.
- `src/test/adminDataEntrySelfSnapshotMirror.test.ts` — new guard test.
- `src/test/resolveSelfAchievedValueStaleGuard.test.ts` — new regression test for the resolver fallback.
- `mem/features/review/self-snapshot-display.md`, `POLICY.md §88.6`, new `docs/adr/ADR-106.md`, `DOCUMENTATION.md` version-history entry.

## Verification

- Reproduce the exact scenario: seed a self row with `achieved_value=99, self_score=5, self_rating='exceeds_expectation', self_achieved_value=38`. Assert Self card renders **99** after the patch.
- Re-run affected specs: `resolveSelfAchievedValue*`, `kpiJourneySection*`, `adminDataEntry*`.
- Post-migration: `SELECT count(*) FROM review_submissions WHERE self_achieved_value IS DISTINCT FROM achieved_value AND self_score IS NOT NULL` → 0.
