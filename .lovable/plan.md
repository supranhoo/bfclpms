## Confirmed facts from read-only checks

I am not treating this as a display-only issue.

### Confirmed from current database state

For the current failing KPI I found in the live data:

- **KPI:** `Completion of Mandated Training Hours`
- **KRA:** `Training & Development`
- **Period:** `April 2026`
- **Mapped org-level employee KPI rows:** `50`
- **Rows with `review_submissions`:** `42`
- **Rows still not propagated into scorecard data:** `8`
- Those 8 rows have:
  - `org_kpi_values.achieved_value` present
  - `org_kpi_values.status = entered`
  - `kpis.status = kra_set`
  - no `review_submissions` row
  - no propagation audit log after the last attempt

Confirmed remaining employees at the time of inspection:

- Anant Shankar Shet
- Mandala Naga Raju
- Monu Kumar Soni
- Mrutyunjaya Mohanty
- S.Lingamurthy Raju
- Sujeet Kumar Singh
- Sunkara Satyanarayana
- Y R V S Murthy

This proves the values were saved to staging, but were not written to the employee scorecard table.

### Confirmed from code

1. The live write hook now uses `resolve_org_kpi_target_kpis`, but **other paths still use direct client-side `kpis` queries**:
   - preview candidate resolution in `OrgKpiDataEntry.tsx`
   - half-propagation validation in `OrgKpiDataEntry.tsx`

2. The row-level Propagate action passes only one employee id, but the completeness guard still compares against the full mapped employee universe. This can create the exact misleading toast pattern like:

   `49 employee KPI(s) could not be advanced`

   even when the user clicked only one row.

3. `propagatedScopeIds.push(sv.scopeId)` is currently done after a propagation attempt, not strictly after a successful propagated write. That can make later status updates/audits believe a row was propagated even when the RPC returned skipped/failed.

4. The live `propagate_org_kpi_value` function still checks non-existent statuses:
   - checks `auditor_check`, but the enum has `audit`
   - checks `final`, but the enum does not have `final`
   - does not check `skip_level_check`
   - does not check `hr_pms_review`

   This is a confirmed policy/schema conflict from earlier approved changes.

5. The previous threshold type error is fixed in the live function signature. Current issue is no longer the `r5..r0 numeric/text` mismatch.

### Not confirmed yet

I am not claiming one single final root cause for every failed click yet.

What is confirmed is a broken propagation architecture:

- staging rows exist
- scorecard rows are missing
- old direct-client validation still conflicts with the new server resolver
- row-level propagation validation is comparing one selected employee against all 50
- status lock logic is using stale enum names

## Risk & Impact Report

- **Data impact:** High. The fix writes or repairs `review_submissions` and may advance `kpis.status` from `kra_set` to `self_review` for eligible rows only.
- **Workflow impact:** High. This affects the Org KPI data-owner propagation workflow.
- **Permission/RLS impact:** High. Server-side resolver and repair must preserve admin/data-owner authorization and must not expose unrelated employee data.
- **UI/UX impact:** Medium. Toasts and preview must stop reporting false bulk failure counts.
- **Regression risk:** High. Org KPI propagation touches `org_kpi_values`, `kpis`, `review_submissions`, audit logs, and review workflow status.
- **Mitigation:** No blind data update. First add deterministic diagnostics and canonical server-side resolution, then repair only rows proven eligible.

## Replan: implementation steps

### Step 1 — Make target resolution single-source-of-truth everywhere

Refactor Org KPI propagation so these all use the same server-side target resolver:

- live write path
- preview path
- row-level propagation path
- completeness validation path

Remove remaining propagation-gating direct client queries like:

```text
supabase.from('kpis').select(...)
```

for Org KPI target discovery.

The canonical rule becomes:

```text
Org KPI target rows = output of resolve_org_kpi_target_kpis
```

### Step 2 — Fix row-level propagation validation

When a user clicks the arrow on one employee row:

- expected target count must be `1`, not `50`
- missed validation must only inspect that selected employee
- the toast must not list the other 49 employees as failures

When a user clicks bulk/card-level propagation:

- expected target count should be the full resolver count
- failures should be shown only for rows actually attempted and not written

### Step 3 — Only mark scopes as propagated after actual write success

Change the flow so `propagatedScopeIds` is updated only when the RPC confirms a write happened.

Current unsafe behavior:

```text
call RPC → push scopeId regardless of propagatedCount
```

Correct behavior:

```text
call RPC → if propagatedCount > 0, push scopeId
```

For skipped rows, keep them out of `propagatedScopeIds` and surface the exact reason.

### Step 4 — Correct workflow status lock rules in the backend RPC

Patch `propagate_org_kpi_value` to use the actual enum values:

Locked statuses should include:

- `manager_check`
- `audit`
- `management_review`
- `skip_level_check`
- `hr_pms_review`
- `approved`

Remove stale/non-existent statuses from logic:

- `auditor_check`
- `final`

This is not optional because policy and schema currently conflict.

### Step 5 — Add a dry-run diagnostic RPC before repair

Create a read-only diagnostic RPC, for example:

```text
diagnose_org_kpi_propagation_gap(...)
```

It returns for a given category/KRA/KPI/period/year:

- total mapped KPI rows
- rows with entered `org_kpi_values`
- rows with scorecard `review_submissions`
- rows eligible to repair
- rows blocked by workflow status
- rows missing staging values
- employee names and reasons

This prevents guessing and gives us a factual before/after report.

### Step 6 — Add a controlled repair RPC for confirmed eligible gaps

Create a `SECURITY DEFINER` repair RPC, for example:

```text
repair_org_kpi_entered_unpropagated_rows(...)
```

It must only repair rows where all are true:

- matching org-level KPI exists
- matching `org_kpi_values` exists
- `org_kpi_values` has value or `is_na`
- no valid `review_submissions` value exists yet
- KPI status is eligible (`kra_set` or allowed pre-review state)
- caller is admin or authorized data owner

It must write:

- `review_submissions.achieved_value`
- `review_submissions.self_score`
- `review_submissions.self_rating`
- `review_submissions.self_remarks`
- evidence fields
- `review_submissions.is_na`

It must advance:

- `kpis.status`: `kra_set` → `self_review`

It must log audit entries for repaired writes.

### Step 7 — Use the repair RPC from the UI only after diagnostics

Add a recovery path to the Org KPI page:

- if entered-but-not-propagated rows exist, show a clear admin/data-owner action
- preview exact affected employees before repair
- repair only confirmed eligible rows
- refresh snapshot after repair

No silent automatic repair on page load.

### Step 8 — Update toasts to be factual

Replace generic messages like:

```text
49 employee KPI(s) could not be advanced
```

with classified results:

- `X propagated`
- `Y already locked by reviewer/workflow`
- `Z entered values still not written — repair available`
- names of only actually affected employees

### Step 9 — Add regression tests

Add tests for:

1. row-level propagation compares selected employee against expected count `1`, not full `50`
2. preview uses server resolver, not direct `kpis` client query
3. `propagatedScopeIds` only updates on actual propagated count
4. backend lock list matches real `review_status` enum
5. entered `org_kpi_values` + `kra_set` + missing submission is repairable
6. locked statuses are not repaired or overwritten

### Step 10 — Documentation and policy sync

Update all required policy/source-of-truth files in the same implementation:

- `POLICY.md`
- `DOCUMENTATION.md`
- `mem/features/admin/org-kpi-propagation-truth.md`

Document:

- `org_kpi_values` is staging
- `review_submissions` is scorecard truth
- resolver RPC is mandatory for target discovery
- direct client-side `kpis` queries must not gate propagation
- repair is allowed only for entered staging rows that are still workflow-eligible

## Validation after implementation

Before declaring fixed:

1. Run diagnostic RPC for the current failing KPI.
2. Confirm it reports the same 8 eligible gaps.
3. Run repair RPC for that KPI.
4. Confirm `review_submissions` becomes `50/50` where all 50 have entered staging values.
5. Confirm no reviewer-locked rows were overwritten.
6. Confirm the UI no longer shows false `49 could not be advanced` after one-row propagation.
7. Run targeted tests.

## If this still does not solve it

Then I will not pretend it is fixed. The next confirmed checks would be:

1. duplicate profiles with same employee name/code
2. KPI name drift beyond current normalization
3. inactive profile filtering mismatch
4. org KPI owner authorization mismatch
5. rating calculation failure for `%` thresholds stored as text
6. audit trigger or status trigger reverting writes

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>