

## Plan — Auto-Inherit Org KPI Status on New KPI Creation

Close the Scenario 2 gap so any newly-created KPI that matches an existing Org KPI signature (same category + KRA + KPI name in the same period) automatically becomes Org-level, inheriting scope and data owner — no admin click required.

### 1. New DB Trigger: `trg_autoinherit_org_level_on_kpi_insert`

Fires `BEFORE INSERT ON public.kpis`. Before the row is written:
- Check if any other KPI exists with the same `(category_id, kra_name, kpi_name, review_period, review_year)` and `is_org_level = true`.
- If yes: set `NEW.is_org_level = true` and `NEW.org_level_scope = <inherited_scope>` on the new row.
- Audit-log the inheritance with `ORG_KPI_AUTO_INHERITED` (system performer = NULL), capturing the source KPI ID and inherited scope.
- Feature-flagged: gated on a new `app_settings.enable_org_kpi_auto_inherit` boolean (default `true`).

Sequencing: this BEFORE INSERT trigger runs first, sets `is_org_level=true`, then the existing AFTER INSERT `trg_autopull_propagated_org_kpi` runs and pre-fills the value if a propagated OKV exists. The data owner is already mapped because ownership is KPI-name-scoped, not employee-scoped.

### 2. Fallback Safety Net — Background Reconciler

For KPIs that pre-date the trigger or were created during a flag-disabled window:
- Add a new admin tool button in the Data Repair tab: **"Reconcile Org KPI Inheritance"**.
- Scans for KPIs where another KPI in the same `(category, kra, kpi, period, year)` group is org-level but this one isn't.
- Preview UI shows count + per-KPI breakdown before write.
- On confirm: bulk-updates `is_org_level=true`, sets matching `org_level_scope`, and the existing autopull trigger then fires per row to fill values where OKVs are propagated.
- Audit action: `ORG_KPI_INHERITANCE_RECONCILED`.

### 3. Admin Settings UI

In the existing System Settings → Org KPI section (where `enable_org_kpi_autopull` toggle lives):
- Add a sibling toggle for `enable_org_kpi_auto_inherit` with a tooltip explaining: "When ON, any new KPI matching an existing Org KPI signature auto-inherits Org status, scope, and data owner."

### 4. Documentation & Memory

- `DOCUMENTATION.md` v2.66.6 changelog entry covering both the trigger and the reconciler tool.
- Update `docs/specs/org-kpi-data-entry-spec.md` §4.0 ("Continuous late-joiner fill") to add §4.0.2 "Auto-Inheritance on KPI Creation", documenting the BEFORE INSERT trigger sequence with autopull.
- Update `mem://features/admin/org-kpi-management-suite` to capture the inheritance + autopull two-trigger pipeline.
- Update `mem://features/admin/data-repair-engine` to add the new reconciler tool.

### Risk & Impact Report

- **Data Impact**: Trigger only flips `is_org_level` from false → true on net-new INSERTs. Never modifies existing rows. The reconciler operates on existing rows but is admin-confirmed with a preview. No schema change beyond the `app_settings` flag.
- **Workflow Impact**: New KPIs that previously sat as normal KPIs in `kra_set` now correctly enter the Org KPI workflow (data owner manages the value, autopull fills the child). This **changes user-visible behavior**: if an admin creates a KPI mid-month and an OKV is already propagated, the employee will see it as `self_review` immediately instead of `kra_set`. This is the intended fix.
- **UI/UX**: One new toggle, one new button in Data Repair. No nav changes.
- **Regression Risk**: Medium — if an admin INTENTIONALLY creates a normal-scope KPI with the same name as an existing Org KPI, the trigger will silently make it Org-level. Mitigated by: (a) the feature flag (admin can disable), (b) the audit log entry (visible in KPI history), (c) name collisions of this kind are policy-violating anyway given the existing duplicate-KPI prevention constraint.
- **Mitigation**: Flag-gated rollout (default ON since duplicate-KPI prevention already protects against accidental name collisions); audit log captures every inheritance; reconciler tool has dry-run preview; existing "Step Back" admin tool can revert any false positive.

### Out of Scope

- Re-propagating the 4 OKVs from Phase A2 (still pending).
- Cross-period inheritance (e.g., March KPI inheriting from Feb Org KPI) — would conflict with monthly rollover semantics, handled separately by the rollover engine.
- Auto-creating OKVs for periods that don't have one yet (admin still controls value entry).

### Deliverables

- New BEFORE INSERT trigger `trg_autoinherit_org_level_on_kpi_insert` + function.
- New `app_settings.enable_org_kpi_auto_inherit` column (default `true`).
- New admin reconciler tool (UI + edge function or RPC).
- Admin Settings toggle for the new flag.
- DOCUMENTATION.md v2.66.6 entry, spec §4.0.2, memory updates.

