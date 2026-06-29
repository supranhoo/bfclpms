
## Goal
When an Admin re-propagates a new Org KPI Value (OKV), update the displayed `Value` / `Rating` on child KPIs **only where the Self stage was a system stub** (auto-advanced by Admin on behalf of self). Real employee submissions and approved final scores remain frozen.

## Why this is the right scope (push-back on a blanket overwrite)
A blanket "always overwrite" path would violate POLICY §88 (Submission Snapshot Immutability) and break HR audit law for real employee submissions. The screenshot you shared has the `auto_advance_reason = 'Scored by Admin on behalf of self'` banner — meaning **no employee ever typed 98.04**; it was a placeholder written by the system so the workflow could advance. Overwriting a placeholder with the corrected OKV is safe and is exactly the gap ADR-092 flagged as a deferred follow-up. Approved / employee-submitted rows stay protected.

## Risk & Impact Report
- **Data Impact:** New write path on `review_submissions` columns `achieved_value`, `self_achieved_value`, `self_score`, `self_rating` — gated to rows where `auto_advance_reason IS NOT NULL` AND `final_score IS NULL` AND the row was not employee-submitted (`self_evidence_url(s) IS NULL` AND `self_remarks` matches the system-generated pattern, or `submitted_by = NULL` / system attribution).
- **Workflow Impact:** None — status, stages, and downstream scores untouched.
- **UI Impact:** Self card now shows 99.61 / Rating 4 after the next Admin propagation on the affected KPI. Existing "System Auto-Advanced" banner stays as the provenance hint.
- **Regression Risk:** Low. We change only one branch inside `propagate_org_kpi_value`; the §88 immutability branch stays the default for all non-auto-advanced rows.
- **Scalability Impact:** Same row count as today; one extra WHERE clause per child row.
- **Mitigation:** New PL/pgSQL unit cases + TS resolver tests for the four matrix combinations (auto-advanced / real-self × approved / not-approved).
- **Rollback:** Single migration; revert the function body to the prior version and the system reverts to today's snapshot-frozen behavior.

## Implementation Plan

### 1. DB — `propagate_org_kpi_value` RPC (single migration)
Inside the per-child loop, after the existing §88 `not_in_kra_set` skip branch, add a **second, narrower branch**:

```text
IF child_row.auto_advance_reason IS NOT NULL
   AND child_row.final_score IS NULL
   AND child_row.submitted_by IS NULL          -- not employee-typed
THEN
   UPDATE review_submissions
      SET achieved_value      = p_new_value,
          self_achieved_value = p_new_value,
          self_score          = <recomputed via calculate_rating()>,
          self_rating         = <recomputed level>,
          updated_at          = now()
    WHERE id = child_row.id;

   INSERT INTO kpi_audit_logs(action, kpi_id, performed_by, old_value, new_value, metadata)
   VALUES ('OKV_AUTO_ADVANCED_RESYNC', ..., NULL,         -- performer NULL = system per memory
           jsonb_build_object('old_value', child_row.achieved_value),
           jsonb_build_object('new_value', p_new_value, 'reason', 'auto_advanced_stub_refreshed'),
           jsonb_build_object('source','propagate_org_kpi_value','okv_id', p_okv_id));
END IF;
```

Downstream reviewer columns (`manager_*`, `auditor_*`, …) are **not** touched — if a manager already scored, their snapshot stays frozen and they can re-score against the corrected value if they want.

### 2. Resolver — `src/lib/review/resolveSelfAchievedValue.ts`
No change required. The resolver already prefers `self_achieved_value`; the new RPC branch will populate it correctly.

### 3. Audit + Timeline
`kpi_audit_logs` action `OKV_AUTO_ADVANCED_RESYNC` is rendered by `KpiTimeline.tsx` / `formatAuditDetails` — add a config entry: `{ icon: RefreshCw, color: 'bg-amber-500', label: 'Auto-Advanced Snapshot Re-synced from OKV' }`.

### 4. Tests
- **PL/pgSQL** (`supabase/tests/propagate_org_kpi_value_resync.sql`): 4 cases — auto-advanced+not-approved (overwrites), auto-advanced+approved (skips), employee-submitted+not-approved (skips per §88), employee-submitted+approved (skips per §88).
- **TS** (`src/test/review/resolveSelfAchievedValue.autoAdvancedRefresh.test.ts`): asserts the Self card reads the refreshed `self_achieved_value` after a simulated RPC response.
- Regression: existing `orgKpiPostPropagationHydration.test.ts` and `orgKpiSnapshotFallbackCoalesce.test.ts` must still pass.

### 5. Docs & Policy
- **POLICY.md** — add `§88.5 Auto-Advanced Stub Refresh Exception (v2.66.66)`: re-propagation MAY overwrite Self snapshot iff the row was system auto-advanced, never employee-submitted, and not final-score-approved; mandatory `OKV_AUTO_ADVANCED_RESYNC` audit row.
- **DOCUMENTATION.md** — v2.66.66 changelog entry; cross-link to ADR-092.
- **docs/adr/ADR-097.md** — new ADR documenting the carve-out and the alternatives rejected (blanket overwrite, manual force-resync RPC).
- **mem/features/review/self-snapshot-display.md** — append "Part 3" note describing the §88.5 carve-out and that the resolver does not need to change.

### 6. UI hint (minor)
On the Self card, when `auto_advance_reason` is set, append a small italic line `Re-syncs from OKV on next propagation` so Admins know what will happen the next time the OKV is corrected. Pure presentation in `ReviewStageCard.tsx`, gated by a new prop populated from `submission.auto_advance_reason`.

## What this will look like for the May-2026 row in your screenshot
1. Admin opens `/admin/org-kpi-data` and re-saves the OKV (or runs Propagate).
2. RPC sees the child has `auto_advance_reason = 'Scored by Admin on behalf of self'`, `submitted_by = NULL`, and `final_score = NULL` → updates Self snapshot to 99.61 / Rating 4 (which is still 4 because 99.61 falls in 99.5%–99.99%, rating 4; if you intended Rating 5 the OKV needs to be ≥ 100%).
3. Audit timeline shows `Auto-Advanced Snapshot Re-synced from OKV` with system performer.
4. Manager Review screen now shows `Value: 99.61 · Rating: 4`.

## Out of scope (deliberately)
- Overwriting Manager / Auditor / Management snapshots — those represent real reviewer work; if they need refresh the existing Bulk Sign-off Override (§88.3) is the sanctioned path.
- Bulk back-fill of past months — this only affects future Admin propagations. A separate one-off repair script can be planned if you want historical auto-advanced rows refreshed.
