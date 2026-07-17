---
name: Self stage value snapshot
description: KpiJourneySection Self card must reconstruct the employee's submitted achieved value, not display the shared (reviewer-mutable) achieved_value column
type: feature
---
`review_submissions.achieved_value` is a SHARED column. Downstream reviewer
stages (e.g. `BULK_STAGE_SIGNOFF_AUDITOR`, AuditScorecard edits) overwrite
it with their own value, while `self_score` / `self_rating` stay frozen
from self-submit time. The Self journey card therefore mixed a mutable
column (Value) with a frozen column (Rating) and could display nonsense
like "Value 3 / Rating 2" (RCA Jun-2026, KPI 8b6e2e67…).

**Rule:** the Self stage card in `KpiJourneySection` MUST resolve its
displayed achieved value through `resolveSelfAchievedValue`
(`src/lib/review/resolveSelfAchievedValue.ts`). Logic, in order:

1. No reviewer-stage `*_achieved_value` written → trust `achieved_value`.
2. If recomputing the rating from `achieved_value` still equals
   `self_score` → trust it (pristine).
3. Otherwise reverse-derive from the KPI's `r0…r5` thresholds (and for
   binary/tiered KPIs use `self_score` directly).
4. If unambiguous candidate found → display it (recovered).
5. Else display "—" with a tooltip referring auditors to the audit log.

**Do not** add a third UI fallback that reads `submission.achieved_value`
for the Self stage — it reintroduces this bug.

**Part 2 (shipped 2026-06-21):** `review_submissions.self_achieved_value`
exists and is the source of truth. Writers: `useSubmitSelfReview`
(employee path) and `propagate_org_kpi_value` RPC (org KPI data-owner
path). Historical rows were backfilled from `kpi_audit_logs`. The
resolver reads this column first and only falls back to recovery logic
when it is null (pre-migration data). Reviewer-stage RPCs MUST NOT write
this column — keeping it write-once at self-submit is what guarantees
the frozen snapshot.

**Part 5 (shipped 2026-07-17, CAPA-2026-07 / ADR-106 / POLICY §88.6):**
Every *self-owning* writer MUST mirror `self_achieved_value` whenever it
updates the shared `achieved_value` column. The gap was `useAdminSubmitReviewData`
(Admin Data Entry → Self): it stamped `achieved_value` + `self_score` +
`self_rating` but never touched `self_achieved_value`, so the Self card
kept showing the stale auto-advance snapshot (e.g. 38) while rating had
advanced to 5. `buildUpdateFields` now writes `fields.self_achieved_value`
in the `role_level === 'self'` branch.

Belt-and-braces:
1. DB trigger `enforce_self_snapshot_mirror` (BEFORE UPDATE on
   `review_submissions`) auto-mirrors `NEW.self_achieved_value :=
   NEW.achieved_value` whenever `achieved_value` changes AND the same
   UPDATE did not set `self_achieved_value` AND no
   `<stage>_achieved_value` was set (that would flag a reviewer-stage
   writer, which must NOT touch the snapshot).
2. `resolveSelfAchievedValue` now has a stale-guard: if
   `self_achieved_value` no longer recomputes to `self_score`, it prefers
   `achieved_value` when that matches, else falls through to recovery.
3. Source-level test `src/test/adminDataEntrySelfSnapshotMirror.test.ts`
   pins the invariant.

**Rule (recap):** self-owning writers mirror; reviewer-stage writers do
not. Any new writer that stamps `achieved_value` on a self-owned row
MUST also stamp `self_achieved_value` (or rely on the DB trigger, but
prefer explicit writes).

**Part 3 (shipped 2026-06-29, v2.66.66 / ADR-097 / POLICY §88.5):**
`propagate_org_kpi_value` now refreshes `self_achieved_value`,
`achieved_value`, `self_score`, and `self_rating` on *auto-advanced
stubs* — rows with `auto_advance_reason IS NOT NULL` AND
`final_score IS NULL` AND no `self_evidence_url(s)`. Status is
preserved (no step-back, no reviewer columns touched). Every refresh
writes a `kpi_audit_logs` row with `action = 'OKV_AUTO_ADVANCED_RESYNC'`
and `performed_by = NULL` (system); `metadata.admin_initiated_by`
carries the human who triggered the propagation.

The resolver does NOT need to change — it already prefers
`self_achieved_value`, and the new code path simply keeps that column
up to date for stubs. Real employee submissions stay frozen exactly as
before. The Self card (`ReviewStageCard.tsx`) shows an italic *"Will
re-sync from Org KPI on next propagation"* hint whenever the row
qualifies, so admins know what the next propagation will do.

**Part 4 (shipped 2026-06-29, v2.66.67 / ADR-098 / POLICY §88.1.d):**
The same "per-stage column is the source of truth, never the shared
`achieved_value`" rule that protects the Self card also applies to every
reviewer card (Manager / Functional Manager / Skip-Level / HR PMS /
Auditor). All five cards already read `<stage>_achieved_value`.

The gap was on the write side: `public.bulk_write_stage_scores` stamped
`<stage>_score` / `<stage>_rating` / `<stage>_remarks` but never wrote
`<stage>_achieved_value`, so a bulk Auditor override that changed
achievement from 2.5 to 5 produced score 2 against `auditor_achieved_value
= 2.5`. The RPC now mirrors `<stage>_achieved_value =
COALESCE(v_achieved_num, v_cur.achieved_value)` in every reviewer-stage
UPDATE. N/A branches null the per-stage column for parity. Audit log
entries carry `mirrored_achieved_value` + `policy = '§88.1.d / ADR-098'`.

Future RPCs that bulk-stamp reviewer scores MUST observe the mirror.
The source-level guard `src/test/bulkWriteStageScoresAchievedMirror.test.ts`
pins this for `bulk_write_stage_scores`. `bulk_management_approve` already
mirrors correctly (ADR-067).