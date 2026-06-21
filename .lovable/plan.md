## RCA — "Self Value changed from 1 → 3, but Rating stuck at 2"

### Confirmed evidence (DB + audit logs for KPI `8b6e2e67…`)

| When | Actor | Action | `achieved_value` | `self_score` | `auditor_achieved_value` |
|---|---|---|---|---|---|
| Jun 15 15:40 | Data owner (Samir Dey) | `ORG_KPI_PROPAGATED` | 1 | 2 | — |
| Jun 16 09:35 | Data owner | re-propagated (idempotent) | 1 | 2 | — |
| Jun 20 15:43 | Auditor bulk sign-off | `BULK_STAGE_SIGNOFF_AUDITOR` (`achieved_in=3`, `prev_carried=2`) | **overwritten → 3** | **NOT touched → still 2** | 3 |
| Jun 20 17:34 | Auditor | `AUDITOR_REVIEWED` (score 0) | 3 | 2 | 3 |
| Jun 21 11:38 | Management | approved | 3 | 2 | 3 |

So the value really did flip 1 → 3 on the row, and the Self badge in the journey card reads two different fields:
- **"Value: 3"** ← `review_submissions.achieved_value` (the shared/current column)
- **"Rating: 2"** ← `review_submissions.self_score` (frozen at self-submit time)

### 5-Why

1. **Why does Self show Value 3 but Rating 2?**
   The card reads `Value` from `achieved_value` and `Rating` from `self_score`. They came from different points in time.
2. **Why did `achieved_value` change after self-submission?**
   The auditor bulk sign-off (`BULK_STAGE_SIGNOFF_AUDITOR`) wrote the auditor's new value (3) into both `auditor_achieved_value` and the shared `achieved_value` column.
3. **Why does the auditor flow touch `achieved_value` at all?**
   Legacy code treats `review_submissions.achieved_value` as the "current canonical" value rather than the **employee-submitted snapshot**. Every stage update was overwriting it.
4. **Why does `self_score` not move with it?**
   `self_score` is correctly frozen at self-submit (snapshot integrity / immutability policy). Only `achieved_value` was wrongly mutated.
5. **Why didn't the UI catch the mismatch?**
   `KpiJourneySection.buildStage('Self', …)` reads `submission.achieved_value` for Self's `Value` and `submission.self_score` for Self's `Rating`. There is no invariant that ties them together — they come from independent columns.

**Root cause:** The "Self" stage in the journey UI is **not source-pure**. It mixes a live/mutable column (`achieved_value`) with a frozen column (`self_score`). The bulk auditor sign-off (and likely any reviewer-stage value edit) overwrites `achieved_value`, breaking the Self snapshot displayed to the auditor/manager.

---

## Risk & Impact Report

- **Data Impact:** No data corruption — `self_score`/`self_rating` are correct (rating 2 for value 1 under the May-26 scale). Only the **displayed Value** under Self is misleading. `auditor_achieved_value`/`manager_achieved_value` already capture stage-specific values; we can rely on them.
- **Workflow Impact:** None — no scoring change. Final scores remain correct (auditor 0, management 0, final 0).
- **UI/UX Impact:** Self card will now show the **employee-submitted value (1)** with Rating 2, which is internally consistent and matches what HR/audit reviewers expect to see.
- **Regression Risk:** Medium — many places read `submission.achieved_value` assuming "latest". We must keep that semantic where it's needed (Manager/Auditor cards, calculations) and only change the Self card to use a frozen self snapshot.
- **Scalability:** No query changes; purely a read-path fix plus optional historical backfill.

---

## Fix Plan (two parts — UI first, then storage hardening)

### Part 1 — UI fix (immediate, no schema change) ✅ ship now
In `src/components/review/KpiJourneySection.tsx`, change Self stage's `achievedValue` to a **self-snapshot resolver**:

```ts
const selfDisplayValue = resolveSelfAchievedValue(submission);
```

Resolver logic:
1. If `submission.self_score` and `submission.self_rating` exist, derive Self's value from the latest **audit-log entry of type** `ORG_KPI_PROPAGATED` / `SELF_REVIEWED` for this KPI (new_value.achieved_value) **OR** reverse-derive via the May-26 scale.
2. Cheap path (no extra query): treat `achieved_value` as Self's value **only when no reviewer stage has written a stage-specific achieved_value** (i.e. `auditor_achieved_value`, `manager_achieved_value`, `management_achieved_value`, `hr_pms_achieved_value` all null). Otherwise, fall back to "—" with a tooltip "Original self value not stored — see audit log".
3. If we add a column (Part 2), use it directly.

Tests: `KpiJourneySection.test.tsx` — given a submission with `achieved_value=3, auditor_achieved_value=3, self_score=2`, Self card must NOT show "Value: 3"; it must show the snapshotted value (or "—" with tooltip).

### Part 2 — Storage hardening (next migration)
Add `review_submissions.self_achieved_value numeric` and:
1. **Backfill** from the earliest `ORG_KPI_PROPAGATED` / `self_submitted` audit log per row.
2. **Write** to it from: `usePropagateOrgKpiValue` (data-owner path), `SelfReviewSheet` submit, and any place currently writing `self_score`. Keep it immutable after that.
3. **Stop overwriting** `review_submissions.achieved_value` from auditor/manager bulk sign-off and reviewer edits — write only to the stage-specific `*_achieved_value` columns. (`BULK_STAGE_SIGNOFF_AUDITOR` RPC + AuditScorecard + ManagementScorecard.)
4. Update `KpiJourneySection` to read `self_achieved_value` for Self.
5. Update POLICY.md (§ Snapshot Immutability) and DOCUMENTATION.md.

Rollback: `self_achieved_value` is additive; Part 1 UI fallback covers rows without it.

### Part 3 — Verification
- Re-open this very KPI in the modal → Self should now show **Value 1, Rating 2** (consistent), Auditor **Value 3, Rating 0**, Management **Value 3, Rating 0**.
- Run propagation again on a different employee, then auditor edits — assert `achieved_value` is no longer overwritten and Self snapshot persists.
- Unit tests for the resolver + an integration test for the auditor bulk sign-off (asserts `achieved_value` unchanged when `self_achieved_value` is present).

---

### Files to touch (estimate)

**Part 1 (now):**
- `src/components/review/KpiJourneySection.tsx` — Self stage value resolver
- `src/components/review/KpiJourneySection.test.tsx` — new case
- `mem/features/review/self-snapshot-display.md` — new memory

**Part 2 (follow-up):**
- New migration: add `self_achieved_value` + backfill from `kpi_audit_logs`
- `src/hooks/usePropagateOrgKpiValue.ts`, `src/components/review/SelfReviewSheet.tsx` — write new column
- Edge / RPC `propagate_org_kpi_value`, `bulk_stage_signoff_auditor` (and equivalents) — stop writing `achieved_value`; write to stage columns only
- `src/components/review/AuditScorecard.tsx`, `ManagementScorecard.tsx` — same
- POLICY.md, DOCUMENTATION.md updates

Confirm and I'll start with Part 1 (UI-only, safe, immediate visual fix), then queue Part 2 as a follow-up migration so we never reproduce this mismatch.