

## Plan — Bi-Monthly Mid-Cycle Scope Edits + Forward Rollover Sync + A2 Re-Propagation

Four items, three of them are gap closures, one is a one-shot data action.

---

### Q1 — Bi-Monthly KPI: Employee → Org scope change mid-cycle (Jan-Feb cycle, edited in Feb)

**Current behavior (audited):**
- `useChangeOrgKpiScope` updates `kpis.org_level_scope` for the **selected `(period, year)`** plus optionally future periods within the same fiscal year (v2.66.5).
- For Bi-Monthly, the actual `kpis` row lives in the **terminal month only** (Feb for Jan-Feb cycle). Jan has no separate KPI row to update.
- The OKV migration helper re-keys values for the edited period only.

**Gap:** The cascade RPC iterates by calendar month (Mar, Apr, May…), not by frequency cycle. For Bi-Monthly KPIs, this means:
1. The Jan-Feb cycle is touched correctly (the row sits on Feb).
2. But the cascade-forward also hits Mar, Apr, May individually — for a Bi-Monthly KPI those months hold no row, so nothing happens; the next real row is May (May-Jun terminal). That works by accident, but it isn't intentional and there's no validation.
3. **Real risk:** if an admin edits in Jan (cycle is open, terminal not reached), the KPI row doesn't yet exist and the change silently no-ops.

**Fix:**
- In `change_org_kpi_scope_cascading`, detect KPI frequency from the source row. If multi-month, restrict the cascade to terminal months of each future cycle within the fiscal year (re-use `resolveTerminalMonth` logic from `auto-rollover-kpis`, port into SQL).
- If admin invokes the dialog on a non-terminal month of a multi-month cycle, surface a clear UI warning: *"This KPI's Jan-Feb cycle terminates in Feb. The change will apply to the Feb row. OKV migration will use Feb as the cycle anchor."*
- Audit-log the resolved terminal month explicitly so reviewers see which row was actually changed.

**Result:** The Jan-Feb cycle continues processing normally; Feb correctly becomes Org-scope; the in-flight self-review/manager-review (if any) remains intact because we don't touch `status`. Both months pass.

---

### Q3 — Mid-month Org KPI promotion must propagate to NEXT month after rollover already happened

**Current behavior (audited):**
- `auto-rollover-kpis/index.ts` line 570–571: `is_org_level` and `org_level_scope` are **copied at the moment of rollover only**. If the source month is edited later (e.g., admin promotes a March KPI to Org-level after April was already rolled over), April's child KPI keeps `is_org_level=false`.

**Fix — Retro-Sync Trigger:**
- New AFTER UPDATE trigger `trg_sync_org_status_to_future_open_periods` on `public.kpis`:
  - Fires when `is_org_level` flips false→true OR `org_level_scope` changes.
  - Finds all sibling KPIs in **future open periods** (same `category_id + kra_name + kpi_name + employee_id`, `review_year/period > NEW`, period not in `review_period_locks`).
  - Updates their `is_org_level` and `org_level_scope` to match.
  - Audit action: `ORG_KPI_FORWARD_SYNCED`, `performed_by = NULL`, metadata logs the source-period UPDATE that triggered it.
- Feature-flagged: `enable_org_kpi_forward_sync` (default `true`).
- Data Owner is auto-mapped because ownership lives in `org_kpi_data_owners` keyed by KPI signature, not by period — already period-agnostic.
- The existing AFTER INSERT auto-pull trigger (`trg_autopull_propagated_org_kpi`) then fills any propagated OKV value for those future-period rows on next read, so no stale values.

---

### Q4 — Org KPI demoted to normal must also clear future periods after rollover

**Same trigger, opposite direction:**
- The same `trg_sync_org_status_to_future_open_periods` trigger handles `is_org_level` true→false: cascades the demotion to future open-period KPI rows, sets `org_level_scope = NULL`.
- Also clears `org_kpi_values.status` references in future periods if any have `draft` rows (delete them; they're orphaned without an Org KPI parent). Audit-log each delete.
- Locked periods are skipped (consistent with v2.66.5 cascade rules).
- Audit action: `ORG_KPI_FORWARD_SYNCED` with `from_org_level=true, to_org_level=false`.

**Single trigger handles both directions.** One feature flag, one audit action with `from`/`to` metadata.

---

### Q2 — Re-propagate the 4 reset OKVs from Phase A2

One-shot server-side action (no UI needed):

| OKV ID | KPI | Period |
|---|---|---|
| `29bf640c-02ca-491e-971f-6d5042d741d3` | Power generation target from WHRB 1050 TPD | February 2026 |
| `96a62c9b-0f80-47ed-a0e2-0f1eb4af538f` | Campaign life of 1050 TPD | February 2026 |
| `6d344293-c067-4d76-a803-4035100b2713` | Power generation from 45 MWh/AFBC | February 2026 |
| `9571e37b-99ec-4c0b-87e6-82eb26cabea8` | Production target from 3X100 TPD | February 2026 |

Steps in default mode:
1. `read_query` to inspect each OKV: confirm `status='draft'`, has `achieved_value`, fetch `category_id + kra_name + kpi_name + period + year` and the matching child `kpi_ids`.
2. Call `propagate_org_kpi_value` RPC (the v2.66.0 atomic version) for each OKV with the resolved `kpi_ratings` payload.
3. Verify post-state: OKV → `propagated`, all matching child KPIs → `self_review` with pre-filled values.
4. Append a "Phase A2 Re-Propagation Report" entry to `DOCUMENTATION.md` with rowcounts and any skipped children.

If any child KPI is not in `kra_set` (e.g., admin manually advanced it), the patched RPC will skip it and return it in the `skipped[]` array — that's reported back, not an error.

---

### Execution Sequence (after approval, in default mode)

1. `cloud_status` → must be `ACTIVE_HEALTHY`.
2. **Q2 first** (data fix, no schema change): inspect → propagate → verify → log.
3. **Q1 + Q3 + Q4 migration**: single migration file creates the forward-sync trigger + flag + patches `change_org_kpi_scope_cascading` for terminal-month resolution.
4. **UI**: Add `enable_org_kpi_forward_sync` toggle to `OrgKpiGovernanceSettings.tsx` (sibling to the existing two flags). Add the multi-month cycle warning to `OrgKpiScopeChangeDialog.tsx`.
5. **Docs/Memory**:
   - `DOCUMENTATION.md` v2.66.7 entry covering Q1 fix, forward-sync trigger, and A2 re-prop report.
   - `docs/specs/org-kpi-data-entry-spec.md` → §4.4 "Forward-Sync of Org Status After Rollover" + §4.1.1 "Multi-Month Cycle Scope Edits".
   - Update `mem://features/admin/org-kpi-management-suite` with the two new behaviors.

---

### Risk & Impact Report

- **Data Impact**: Q1 patch is a SQL refinement of an existing RPC — no schema change. Q3/Q4 trigger only fires on UPDATE of `is_org_level`/`org_level_scope` and only modifies future, **unlocked** periods. Q2 uses the existing tested atomic propagate RPC.
- **Workflow Impact**: Promotions silently propagate forward (intended); demotions also propagate (intended). Locked periods skipped. Existing in-flight reviews on already-rolled future months may see their `is_org_level` flip — does not change `status`, so reviews continue, but the UI badge/visibility changes. Acceptable.
- **Regression Risk**: Medium — the forward-sync trigger could amplify a wrong admin click across many future months. Mitigated by: feature flag, audit log per row, locked-period skip, existing Step Back tool.
- **Mitigation**: Toggle defaults to ON but admin can disable; every cascade audit-logged with `from`/`to` and target period; manual revert via Step Back.

### Out of Scope

- Cross-cycle inheritance for multi-month KPIs spanning fiscal-year boundaries (rare; handle separately if it surfaces).
- Backfilling forward-sync for historical mismatches (separate Data Repair tool — defer until requested).

### Deliverables

- Atomic re-propagation of 4 A2 OKVs + report.
- New trigger `trg_sync_org_status_to_future_open_periods` + feature flag `enable_org_kpi_forward_sync`.
- Patched `change_org_kpi_scope_cascading` with frequency-aware terminal-month resolution.
- Updated `OrgKpiGovernanceSettings` (3rd toggle) and `OrgKpiScopeChangeDialog` (cycle warning).
- DOCUMENTATION.md v2.66.7 entry, spec §4.4 + §4.1.1, memory update.

