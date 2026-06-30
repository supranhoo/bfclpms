
## 1. Assumptions

- Affected user: V.A.V.S.S. Ganapathi Varma (`59a7d12e-…`), but the defect is system-wide for any Quarterly / Bi-Monthly / Half-Yearly / Yearly KPI.
- Sequence reproduced from DB + edge logs:
  1. Earlier today, June→July rollover ran (cron or manual). It created `July / August / September 2026` rows with `frequency_cycle_start = 'Jul-Sep'` (the Q3 window label).
  2. User then deleted all June 2026 KRAs.
  3. User triggered May→June rollover. `buildNewKpi` synthesised `frequency_cycle_start = 'Apr-Jun'` for the new June row (the Q2 window label).
  4. ADR-090 trigger `enforce_intra_year_cycle_anchor_consistency` saw an existing 2026 sibling with anchor `Jul-Sep` ≠ `Apr-Jun` → raised `check_violation`.
- No data has been corrupted; the insert is rejected pre-commit.

## 2. Clarifications

None blocking — defect and remediation are unambiguous. One product decision flagged in §10.

## 3. Risk & Impact Report

| Dimension | Current state (defect) | After fix |
|---|---|---|
| Data | All Quarterly / Bi-Monthly / Half-Yearly rollovers fail across the whole org whenever a later cycle's rows already exist in the same year. No corruption, but new month rows cannot be created. | No change to historical rows; future inserts succeed. |
| Workflow | Monthly rollover (cron + manual KRA Rollover UI) is effectively broken for ~all multi-month KPIs from the second cycle onward each year. | Restored. |
| UI/UX | "Rollover Failed — Edge Function returned a non-2xx status code" toast on Step 2 Preview. | No UI change required; toast disappears once edge function succeeds. |
| Regression | The ADR-090 trigger was introduced 2 days ago specifically to STOP intra-year drift (Sajid Raza / Prabhat Singh Bi-Monthly case). Loosening it incorrectly would let that bug return. | Mitigated by narrowing the rule to "same cycle window must share anchor", not "whole year must share anchor". |
| Scalability | Trigger runs per-row INSERT; current query is indexed-friendly. New rule remains O(1) per insert. | Same. |
| Security | None; trigger is `SECURITY DEFINER` on `public.kpis` only. | Same. |

## 4. Root Cause Analysis (5-Why)

**Symptom:** `Insert failed: Cycle anchor conflict (ADR-090): cannot insert KPI with anchor Apr-Jun, existing rows in same year use Jul-Sep.`

1. **Why did the insert fail?** The ADR-090 trigger raised `check_violation` because the new June row's anchor `Apr-Jun` differs from the existing July/Aug/Sep rows' anchor `Jul-Sep`.
2. **Why are the existing rows tagged `Jul-Sep`?** Because the earlier June→July rollover called `resolveCycleAnchorForPeriod('Quarterly', 'July')` which returns the **current cycle window label** (`Jul-Sep`), not a stable series identifier.
3. **Why does the trigger treat two different cycle windows as a conflict?** ADR-090 enforces "one anchor per `(employee, kpi_name, review_year, frequency)`" — it assumed `frequency_cycle_start` is a **series identifier** (e.g., "Feb-Mar" = Bi-Monthly offset that always means Feb-anchored), which is how ADR-088 originally framed it for the Prabhat/Sajid offset case.
4. **Why is the same column carrying two different semantics?** `resolve_cycle_anchor(frequency, month_idx)` and the matching TS helper compute the **window containing that month** (Apr-Jun, Jul-Sep, Oct-Dec…). For Bi-Monthly the window of the *first* cycle happens to equal the *series* tag ("Feb-Mar"), which is what masked the ambiguity in ADR-088's test data. For Quarterly across a year, the windows are genuinely different.
5. **Why didn't ADR-090's regression test catch this?** The test (`cycleAnchorRepairSelection.test.ts`) only covers the **repair selection** (oldest-row-wins) for Bi-Monthly where every cycle in a year resolves to the same offset anchor. There is no test for Quarterly multi-cycle inserts in the same year, and no test that simulates "delete one cycle, re-rollover from prior month" after a later cycle has already been materialised.

**True root cause:** **Semantic mismatch** — `frequency_cycle_start` is computed per-row as the *cycle window label* but the new ADR-090 invariant treats it as a *yearly series tag*. The trigger is over-eager for any frequency whose year contains more than one distinct cycle window (Quarterly, Half-Yearly, and any Bi-Monthly whose row set spans multiple cycles).

## 5. Step-by-step Plan

```
Step 1 ─ Tighten the trigger to its real intent
        public.enforce_intra_year_cycle_anchor_consistency()
        New rule: reject only when an EXISTING row whose review_period
        FALLS INSIDE NEW.frequency_cycle_start's window carries a
        different anchor (true cycle-internal disagreement). Different
        cycle windows in the same year are allowed.

Step 2 ─ Re-tighten detector to mirror the new invariant
        public.detect_intra_year_cycle_anchor_drift()
        Group by (employee, kpi_name, year, frequency, cycle_window)
        and flag only multi-anchor groups. Stops false-positive drift
        alerts.

Step 3 ─ Re-tighten the repair RPC
        public.repair_intra_year_cycle_anchor_drift()
        Scope oldest-row-wins to rows sharing the same cycle window,
        not the whole year. Idempotent and audit-trailed
        (`policy='ADR-091'`, `strategy='oldest_row_wins_per_window'`).

Step 4 ─ Regression locks
        - src/test/cycleAnchorWindowConsistency.test.ts (pure helper
          that mirrors the trigger predicate; covers Quarterly,
          Bi-Monthly offset, Half-Yearly, the delete-and-re-rollover
          scenario).
        - supabase/functions/auto-rollover-kpis tests already exist
          for stickiness; add one for the cross-cycle case.

Step 5 ─ SSOT updates
        ADR-091 (supersedes ADR-090 invariant wording)
        POLICY.md §90 amendment
        DOCUMENTATION.md version-history bump
        mem://infrastructure/database/cycle-anchor-drift-monitor refresh

Step 6 ─ Verify
        Re-run May→June rollover for V.A.V.S.S. Ganapathi Varma →
        expect 27 KPIs inserted, 0 errors, 0 audit-log churn on
        non-affected rows.
```

## 6. UI Changes

**Not Applicable** — fix is DB-trigger + edge-function-test layer only. The "Rollover Failed" toast will simply stop appearing.

## 7. Implementation Sketch (Technical Detail)

### New trigger predicate (Postgres)

```sql
CREATE OR REPLACE FUNCTION public.enforce_intra_year_cycle_anchor_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_window_months text[];
  v_conflict_anchor   text;
BEGIN
  IF NEW.frequency_cycle_start IS NULL
     OR NEW.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;

  -- Months covered by NEW.frequency_cycle_start (e.g. 'Apr-Jun' → {April,May,June}).
  v_new_window_months := public.expand_cycle_window_months(
    NEW.frequency, NEW.frequency_cycle_start
  );

  SELECT frequency_cycle_start INTO v_conflict_anchor
  FROM public.kpis
  WHERE employee_id = NEW.employee_id
    AND kpi_name    = NEW.kpi_name
    AND review_year = NEW.review_year
    AND frequency   = NEW.frequency
    AND frequency_cycle_start IS NOT NULL
    AND frequency_cycle_start <> NEW.frequency_cycle_start
    AND review_period = ANY (v_new_window_months)   -- same cycle, different tag
  LIMIT 1;

  IF v_conflict_anchor IS NOT NULL THEN
    RAISE EXCEPTION
      'Cycle anchor conflict (ADR-091): same cycle window has anchors % and %',
      v_conflict_anchor, NEW.frequency_cycle_start
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
```

Plus a small immutable helper `public.expand_cycle_window_months(freq, anchor) → text[]` that returns the month-name list for the anchor window (uses the existing month-abbrev array). Edge function and detector reuse the same helper.

### Auto-rollover

No change needed; `resolveCycleAnchorForPeriod` continues to emit per-window labels, which is what the data model already stores.

## 8. Tests

- `src/test/cycleAnchorWindowConsistency.test.ts`
  - Quarterly: inserting `June/Apr-Jun` while `Jul/Jul-Sep` already exists → allowed.
  - Quarterly: inserting `May/Jul-Sep` (wrong anchor for May) while `Apr/Apr-Jun` exists → rejected.
  - Bi-Monthly offset: `Feb-Mar` series across the year → allowed (same as today).
  - Bi-Monthly: `May/Apr-May` vs existing `April/Feb-Mar` → rejected (drift).
- `supabase/functions/auto-rollover-kpis/cycleAnchorCrossCycle_test.ts`
  - Simulates the exact V.A.V.S.S. scenario (May→June with Jul/Aug/Sep present) and asserts 27/27 inserts.

## 9. DOCUMENTATION.md updates

- §"Multi-month KPI cycle anchor" → amend to clarify dual semantics (window-label per row; uniqueness scoped to the window, not the year).
- Version History: add `v3.x — ADR-091 supersedes ADR-090 invariant`.

## 10. POLICY.md updates

- §90 amended: "`frequency_cycle_start` MUST be a valid window label for the row's `review_period`. Two rows MAY carry different anchors within the same year provided they belong to different cycle windows. Two rows whose `review_period` falls inside the same cycle window MUST share `frequency_cycle_start`."
- Open product question (non-blocking — default = "yes"): **Should an offset Bi-Monthly KPI authored mid-year auto-propagate its series anchor to existing standard-anchored rows in the same year, or only to future rollovers?** Today's behaviour = future only; ADR-088 implied "future only" as well. Confirming explicit policy text.

## 11. Rollback Strategy (§18)

- Trigger and helpers replaced in a single migration. Rollback = re-apply the ADR-090 trigger definition (kept verbatim in the migration's `DOWN` comment block). No data mutation, so rollback is instantaneous.
- Repair RPC is additive; old ADR-090 RPC retained behind a `_v1` suffix for one release cycle.

## 12. Data Lifecycle (§19)

No new tables, no new retention requirements. Existing `kpi_audit_logs` continues to record `KPI_CYCLE_ANCHOR_REPAIRED` events from any future repair runs.

## 13. Decision Justification (§20)

- **Chosen:** narrow the invariant from "year" to "cycle window". *Why:* matches how the column is actually computed and consumed; surgical; preserves the bug-fix value of ADR-088/090; zero data migration.
- **Rejected A — Redefine `frequency_cycle_start` to a stable series tag and rewrite all generators.** Touches auto-rollover, materialise-org-kpi, admin bulk apply, KRA library propagation, UI cycle label rendering, ADR-087 client resolver, and requires a full historical backfill. High blast radius for a defect that has a one-line semantic fix.
- **Rejected B — Drop the trigger entirely and rely on UI guards only.** Re-opens the Prabhat/Sajid silent-drift class of bugs. ADR-090's intent is sound; only its scope is wrong.
- **Rejected C — Allow any anchor as long as it is valid for the frequency.** Permits two different rows for the same month to disagree, which IS a real conflict and was the original ADR-088 concern.

## 14. Post-implementation Notes

Once approved, the migration + edge-function tests + ADR-091 land in one change set, followed by an immediate re-run of the failed rollover for V.A.V.S.S. Ganapathi Varma to confirm green path. No backfill expected, but `detect_intra_year_cycle_anchor_drift()` will be invoked once post-deploy to confirm zero real drift rows survived the rule change.
