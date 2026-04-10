

## RCA: Review Journey Shows Data But Timeline Is Empty & KPI Stuck at KRA Set

### Root Cause Analysis

**The core issue is a two-part data pipeline failure:**

#### Finding 1 — Org KPI Data Saved But Never Propagated to Employee KPIs

The `org_kpi_values` table has a **default column value of `status = 'approved'`**. When a data owner saves org KPI data via the "Save" button (`handleCardSave`), new records are inserted with `status = 'approved'` automatically — but the **propagation step is never triggered**. Propagation only runs when the user explicitly clicks "Save & Propagate" (`handleCardSaveAndPropagate`).

**Evidence:**
- Firoz's LTI KPI (`cef2ea2a`): status `kra_set`, no review_submission, no `ORG_KPI_PROPAGATED` audit log
- `org_kpi_values` for this KPI: `achieved_value: 0`, `status: approved` (set by DB default, not by propagation)
- **40 out of 41** LTI employee KPIs are stuck at `kra_set` — only 1 was propagated correctly
- The `propagate_org_kpi_value` RPC correctly upserts review_submissions AND advances `kpi.status` from `kra_set` → `self_review`, but it was never called for these 40 KPIs

#### Finding 2 — Review Journey Shows Phantom Score From Org KPI Fallback

`KpiJourneySection.tsx` line 343 uses a fallback chain:
```
submission?.achieved_value ?? orgAchievedValue ?? null
```
Since the KPI was never propagated (no submission exists), `orgAchievedValue` (from `org_kpi_values`) is used as a fallback. The `recalcScore()` function then computes a rating from this value (e.g., `0` → Rating 0 for binary LTI), making it appear as though a "Self" review was submitted — when in fact, no review_submission record exists.

#### Finding 3 — Timeline Is Empty Because No Propagation Occurred

The Timeline fetches from `kpi_audit_logs`. Since propagation never ran, no `ORG_KPI_PROPAGATED` or `STATUS_TRANSITION` entries were created for this KPI. The only logs are `TEMPLATE_PROPAGATION` (template master sync) and `ADMIN_OVERRIDE` (admin edit), which are from the initial KPI setup — not from the review workflow.

### Impact Assessment
- **40 employees** have LTI KPIs stuck at `kra_set` despite org data being entered and "approved"
- This likely affects **multiple Org KPIs** across categories, not just LTI
- The Review Journey displays misleading scores for unpropagated KPIs
- Managers and auditors cannot review these KPIs because status never advanced

### Plan

**1. Fix the Org KPI fallback display in Review Journey**
- File: `src/components/review/KpiJourneySection.tsx`
- When `kpi.status === 'kra_set'` AND no submission exists (self_score is null), the Self stage should show a distinct "Org Data Available (Not Propagated)" indicator instead of rendering a computed rating that implies a self-review was done
- Only use `orgAchievedValue` in the Self stage `buildStage` call if a submission record actually exists (i.e., propagation already wrote to review_submissions)

**2. Fix the `org_kpi_values` default status**
- Database migration: Change the default value of `org_kpi_values.status` from `'approved'` to `'entered'`
- This ensures new records start as "entered" and only move to "propagated"/"approved" through explicit workflow actions

**3. Add auto-propagation trigger on org_kpi_values insert/update**
- Create a database trigger or modify `useBulkUpsertOrgKpiValues` to automatically queue propagation when data is saved for `employee`-scoped org KPIs
- Alternative: Add a prominent "Propagation Required" warning in the OrgKpiDataEntry UI when values exist but are not yet propagated

**4. Create a repair edge function to fix existing orphaned data**
- SQL repair script to propagate the 40+ stuck LTI KPIs (and any other org KPIs in the same state)
- For each `org_kpi_values` record where `status = 'approved'` but the matching KPI is still at `kra_set` with no review_submission:
  - Call `propagate_org_kpi_value` RPC to write review_submission and advance status
  - Or directly insert review_submission records and update KPI status

**5. Update DOCUMENTATION.md and POLICY.md**
- Document the org KPI propagation lifecycle
- Version bump

### Risk Assessment
- **Data Impact**: The repair script will write to `review_submissions` and update `kpi.status` — this is the same operation the propagation RPC already performs, so it's safe
- **Regression Risk**: Low — the display fix adds a guard that only uses orgAchievedValue when propagation has actually occurred
- **Workflow Impact**: Changing the default status from `approved` to `entered` will affect future saves — existing "approved" records remain untouched

