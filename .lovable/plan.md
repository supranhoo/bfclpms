## What the user is seeing

After a successful Propagate on `/admin/org-kpi-data`:
- **Impact** sheet shows the propagated value (it reads `review_submissions`).
- **Entry table** for the same KPI shows blank ("—") for every scope row.

This is the same class of bug we fixed in May for **employee-scope** KPIs via `useOrgKpiSubmissionFallback` (ADR pending) — but the fix was only wired into the **employee** branch of `buildCardData`. The **department** and **organization** branches still read OKV only, so the values look "vanished" on those scopes.

That matches both reports:
- Ankan (101967 / 101962) — Training & Development KPI is employee-scope but one OKV row has `achieved_value = NULL` with `is_na = false` (DB confirmed). Fallback resolution edge case isn't bullet-proof when `val` exists with NULL achieved.
- Vivek's "SOP KPI" — almost certainly department- or organization-scope (SOP adherence KPIs are typically org-wide), so the existing employee-only fallback never runs.

## RCA (single source of truth)

`src/pages/admin/OrgKpiDataEntry.tsx → buildCardData`:

| scope | line | fallback applied? |
|---|---|---|
| `employee` | 533–536 | ✅ uses `submissionFallbackMap` |
| `department` | 494 | ❌ `val?.achieved_value ?? null` |
| `organization` | 584 | ❌ `existing?.achieved_value ?? null` |

Also for the employee branch, `fallbackIsNa` short-circuits when `val` exists, so a row written by Propagate with `achieved_value = NULL, is_na = false` correctly reads the fallback for `achievedValue` but never re-checks `is_na` from the submission.

## Fix (UI / hook only — no DB, no RPC change)

### 1. Broaden `useOrgKpiSubmissionFallback`
`src/hooks/useOrgKpiSubmissionFallback.ts`:
- Drop `.eq('org_level_scope', 'employee')` so the index covers `employee`, `department`, and `organization` rows.
- Continue keying employee-scope entries `${defKey}||${employeeId}`.
- Add a department-aggregated key `${defKey}||dept||${departmentId}` resolved as the **non-null mode** (most common) of `review_submissions.achieved_value` across the department's mapped employee KPIs. If all employees agree, that's the propagated value; if they diverge, prefer the most recent submission.
- Add an organization-aggregated key `${defKey}||org` using the same mode rule across all mapped employee KPIs for that definition.
- Both aggregates also report `isNa` (true only if every contributing submission is NA).

### 2. Wire the fallback into the missing scopes in `buildCardData`
- **department** branch: replace line 494 with the same `val?.achieved_value ?? fb.achievedValue` pattern, looking up `${kpiKey}||dept||${deptId}`. Mirror the `isNa` logic.
- **organization** branch: replace line 584 with `existing?.achieved_value ?? fb.achievedValue` using `${kpiKey}||org`.
- Add `submissionFallbackMap` to the `useCallback` dep array (already present for the employee branch).

### 3. Tighten employee-branch `isNa` fallback
- When OKV row exists with `achieved_value = NULL` AND `is_na = false`, treat as "value missing" and read both `achievedValue` and `isNa` from the fallback. Prevents the "row exists but blank" edge case Ankan hit on his March entry.

### 4. Refresh after Propagate
Confirm `usePropagateOrgKpiValue.onSuccess` already invalidates `org-kpi-submission-fallback` (it does — line 325/419). No change needed.

### 5. Tests
- Extend `src/test/orgKpiPostPropagationHydration.test.ts` with three new locked cases:
  - department scope row resolves from fallback when OKV achieved is NULL,
  - organization scope row resolves from fallback when OKV row absent,
  - employee row with `val.achieved_value=null, val.is_na=false` resolves both `achievedValue` AND `isNa` from fallback.

## Risk & impact

- **Data:** read-only; no schema, no RLS, no RPC change. Snapshot immutability (POLICY §88) preserved — fallback only feeds the entry-table display, never writes.
- **Workflow:** no change to Propagate, save, or scoring engine.
- **UI/UX:** entry table now matches Impact sheet on every scope. Eliminates the "vanished data" confusion for data-entry users.
- **Regression risk:** low. Fallback is additive and gated on `val.achieved_value` being null/missing, so OKV-authoritative rows are unchanged.
- **Mitigation:** unit tests above + the existing employee-scope tests act as regression guardrails.

## Files touched

- `src/hooks/useOrgKpiSubmissionFallback.ts` (broaden scope, add dept/org aggregates)
- `src/pages/admin/OrgKpiDataEntry.tsx` (`buildCardData` department + organization + employee isNa)
- `src/test/orgKpiPostPropagationHydration.test.ts` (new cases)
- `docs/adr/ADR-062.md` (new — extends ADR-055/056 fallback policy to all three scopes)
- `mem/features/admin/org-kpi-data-entry-snapshot.md` (note that scope-aware fallback is mandatory on all three branches)

## Out of scope

- Backfilling NULL `org_kpi_values.achieved_value` rows from `review_submissions` (data-repair job — separate ticket).
- Changing the propagation RPC to also update OKV.achieved_value when only RS is touched (would need POLICY §88 review).
