# Org KPI Re-Entry Visibility Gap — RCA, 5-Why & CAPA

## Pinpointed case (forensic trace)

KPI: *Achieve organization's production target → "Handle all breakdowns…"* — **May 2026**, KPI definition id `Maintenance & Reliability / c8fbb996…`.

Timeline reconstructed from `org_kpi_data_entry_logs` + `review_submissions`:

| When | Actor | Action | Effect |
|---|---|---|---|
| 2026-06-10 | Biswajit | `created` + `propagated` (15.16) | OKV rows created, children copied to `review_submissions` while still at `kra_set` |
| 2026-06-15 | Admin (bulk) | `admin_zero_scored` | OKV achieved 15.16 → 0; children advanced |
| 2026-06-17 | Biswajit | `updated` (×4) + child self-submits | `review_submissions.self_achieved_value=9.67`, `manager_achieved_value=9.67`, `manager_score=2` for Y R V S Murthy |
| 2026-06-23 | Admin (ca3897d0) | `unlocked` ×4 + `rollback_to_data_entry` ×3 ("requested by biswajit ji") | OKV rows cleared back to data-entry; **`review_submissions` snapshots preserved** (POLICY §88 immutability) |
| 2026-06-28 16:00–16:01 | Biswajit | `created` (9.67, 10, 15.16) + `propagated` (9.67 → scope `ce295ac5`, 10 → scope `223ba922`) | OKV rows for those two scopes set to `propagated`. **No write to child `review_submissions`** because every child KPI is past `kra_set` (statuses: `manager_check`, `self_review`, `approved`). |

Observed UI state (matches DB):

- **Admin Org KPI Data Entry card** says *"7 propagated · 2 / 7 entered"* — counts OKV scopes, looks healthy.
- **Scoped table** correctly shows the 2 entered values (Prabhat 10, Sunkara 9.67) and `—` for the other 5 — because OKV holds no value for them.
- **KPI Details / employee dashboard** for Y R V S Murthy shows Self 9.67 / Manager 9.67 — the **frozen June-17 snapshot**, not the new OKV state.
- **KPI Registry / All-KRAs table** reads from `kpis` + `review_submissions` and therefore shows the stale snapshot too.

So Biswajit's complaint is the inverse of what it sounds like: the *re-entered* OKV value never reached the employee scorecard. The "dashboard 9.67" is the old June-17 manager score that happens to numerically match the new entry, masking the gap until someone re-entered a different number (10 for Prabhat) and noticed the row didn't refresh.

## Root cause

Two distinct gaps interacting:

1. **Re-propagation after rollback is silently no-op for advanced children.** `propagate_org_kpi_to_children` (and its hook) writes to `review_submissions` **only when the child KPI is at `kra_set`**, honouring POLICY §88 (snapshot immutability after self-review starts). After a `rollback_to_data_entry` the *OKV* row resets, but the *child* `kpis.status` and `review_submissions` are not reverted — so a subsequent propagate succeeds at the OKV layer but is a no-op at the child layer, with **no warning or audit row**.
2. **No reconciliation indicator on the OKV card.** The "Propagated" pill and the per-row `propagated` badge are computed from OKV state, not from "did this value actually reach the child snapshot?". There is no `value_drift` signal comparing `org_kpi_values.achieved_value` vs `review_submissions.{stage}_achieved_value` for the mapped child.

## 5-Why

1. **Why** does the new value not appear in the KPI table? → `review_submissions` for the child KPIs was not updated when Biswajit re-propagated on 06-28.
2. **Why** wasn't it updated? → The propagation routine skips children whose `kpis.status ≠ 'kra_set'` to preserve frozen snapshots (POLICY §88).
3. **Why** were the children past `kra_set`? → The 06-23 `rollback_to_data_entry` only reverts the OKV row; it does not cascade-revert child `kpis.status` / `review_submissions`.
4. **Why** is there no cascade or warning? → Rollback was designed as an OKV-only "owner can re-enter" action, on the assumption that the data owner would re-propagate before children moved off `kra_set`. There is no guard that detects "children already advanced — re-propagate will not reach them".
5. **Why** did the admin & data owner not notice? → The Org KPI card shows OKV-truth ("2 Propagated", green pill) with no `value_drift` indicator vs the child snapshot, so the success badge looks authoritative.

Root cause class: **policy/UX gap, not a code bug.** The immutability rule is correct; the missing piece is detection + signalling + a controlled override path.

## FMEA (top failure modes)

| # | Failure mode | Effect | Sev | Occ | Det | RPN | Mitigation |
|---|---|---|---|---|---|---|---|
| F1 | Re-propagation after rollback silently skips advanced children | Stale scorecard, wrong final score | 9 | 7 | 2 | 126 | Drift detector + UI banner + audit row |
| F2 | "Propagated" pill computed only from OKV state | False assurance to admin/owner | 7 | 8 | 2 | 112 | Replace pill with `OKV ✓ / Snapshot ✗` two-state badge |
| F3 | Rollback does not warn that children are past `kra_set` | Data owner triggers unrecoverable mismatch | 8 | 5 | 3 | 120 | Pre-rollback confirm dialog listing advanced children |
| F4 | No back-fill path when drift is detected | Manual fix required, audit risk | 7 | 4 | 3 | 84 | Admin-only "Re-sync snapshot" RPC, fully audited |
| F5 | Same pattern hides in other multi-stage entry surfaces (Daily KPI, Safety) | Repeat outage class | 8 | 3 | 4 | 96 | Generalise drift check into a shared library |

## CAPA Plan

**Corrective (this incident)**

1. **Forensic patch**: for the affected May-2026 cohort, list every `(kpi_id, scope)` where `org_kpi_values.achieved_value IS NOT NULL` AND any mapped `review_submissions.{self_achieved_value, manager_achieved_value}` differs. Export the diff so a human (Biswajit + admin) can decide per child whether to (a) accept OKV truth and admin-resync the snapshot via the existing `Admin Data Entry` editor, or (b) accept the existing snapshot and clear OKV. **No silent overwrite.**
2. **Audit row**: log a `OKV_SNAPSHOT_DRIFT_DETECTED` entry in `kpi_audit_logs` for each diff, performed_by NULL, so the timeline is honest.

**Preventive (system)**

3. **Drift detector library** (`src/lib/orgKpiSnapshotDrift.ts`): pure function `detectSnapshotDrift(okvRow, childSubmissions[])` returns `{ inSync, advancedChildren, divergentChildren }`. Unit-tested.
4. **UI signal on Org KPI Data Entry card**:
   - Replace the single "Propagated" pill with a compound `OKV ✓ · Snapshot ✓/✗` badge.
   - When `!inSync`, render a yellow "Value did not reach N reviewer snapshot(s)" banner with a "View affected employees" expander.
5. **Pre-rollback guard**: in `useRollbackOrgKpiPropagation`, if any mapped child is past `kra_set`, the confirm dialog must list them and require an explicit "I understand re-propagation will not overwrite their scores" checkbox.
6. **Pre-propagate guard**: in `useSaveAndPropagateOrgKpiValue`, if any mapped child is past `kra_set`, show a dialog explaining the value will be stored at OKV layer only and will not reach reviewer snapshots; admin gets an extra "Force resync (audited)" option behind `has_role('admin')`.
7. **Admin-only `resync_org_kpi_snapshot(scope_id, period, year, reason)` RPC** — the only sanctioned path that overwrites a non-`kra_set` snapshot, always writes `kpi_audit_logs.action = 'OKV_FORCED_RESYNC'` with the OKV id, old/new achieved values, and the supplied reason. Final-score-approved children remain immutable (POLICY §88) and the RPC raises.
8. **Tests**:
   - Unit: drift detector across (kra_set, self_review, manager_check, approved) × (value-match, value-mismatch, NULL).
   - Integration: rollback → re-propagate flow asserts the drift banner and that no silent snapshot write occurred.
   - Migration regression: query `org_kpi_data_entry_logs` for any (period, kpi) where a `propagated` event has no corresponding `review_submissions` update within 1 minute — should fail before the fix, pass after, for the May-2026 cohort.
9. **Docs/policy**:
   - `POLICY.md` → new §129 "OKV re-propagation after rollback".
   - `DOCUMENTATION.md` Version History entry.
   - `docs/adr/ADR-092.md` "OKV snapshot drift detection".
   - `mem/features/admin/okv-snapshot-drift.md` + index entry.

## UI changes (frontend only, all on `/admin/org-kpi-data`)

- `OrgKpiEntryCard.tsx` — compound badge, drift banner, expander listing advanced children.
- `useRollbackOrgKpiPropagation.ts` confirm dialog enrichment.
- `useSaveAndPropagateOrgKpiValue.ts` pre-propagate dialog.
- New `OrgKpiDriftBanner` component.

No change to scoring logic, no change to immutable snapshots, no edits to `review_submissions` outside the audited admin RPC.

## Out of scope

- Changing POLICY §88 (snapshot immutability stays).
- Touching `final_score` of any approved row.
- Backfilling historical periods other than the forensic May-2026 export. Past periods will only show the drift banner; corrections remain manual.

## Verification gates

- 4 new unit tests pass (`bun test`).
- Manual: re-run the Y R V S Murthy May-2026 scenario in preview → banner appears, KPI Details still shows old snapshot until admin runs `resync_org_kpi_snapshot`, audit log shows `OKV_FORCED_RESYNC`.
- DB diff query for May-2026 returns 0 silent-divergence rows.
