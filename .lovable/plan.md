## Risk & Impact Report

- **Data Impact:** No historical data rewritten. New writes will reach employees in departments the data owner cannot see via RLS — which is the intended behaviour for org-level KPIs.
- **Workflow Impact:** Eligibility ladder (kra_set / self_review / reviewer_locked / not_in_kra_set) is preserved. Authorisation gains an explicit server check.
- **UI/UX Impact:** None visible, except previously "Not propagated" rows in hidden departments will now flip to "Propagated" after a propagate action.
- **Regression Risk:** Medium — propagate is a hot path. Mitigated by reusing the existing `propagate_org_kpi_value` core and adding a regression test.

## Root Cause (recap)

`OrgKpiDataEntry` reads via `get_org_kpi_data_entry_snapshot` (SECURITY DEFINER, sees all 50 employees). But the propagate write path resolves target KPIs through `fetchTargetKpis` → `supabase.from('kpis').select(...)`, which is filtered by RLS. The 10 employees in departments hidden from the data owner are silently dropped before the RPC runs, so no `review_submissions` row is written and the row stays "Not propagated" forever.

## Implementation Plan

1. **New SECURITY DEFINER RPC `resolve_and_propagate_org_kpi`**
   - Inputs: `p_category_id`, `p_kra_name`, `p_kpi_name`, `p_review_period`, `p_review_year`, `p_scope` (`organization|department|employee`), `p_department_id`, `p_employee_id`, `p_achieved_value`, `p_is_na`, `p_remarks`, `p_evidence_url`, `p_overwrite_policy`.
   - Authorise: caller must be `admin` OR an active `org_kpi_data_owners` row matching `(category_id, normalized kra_name, normalized kpi_name)`.
   - Resolve targets directly in SQL: `SELECT id, target_value, weightage, r0..r5, criteria, uom, uom_type, qualitative_options, threshold_mode FROM kpis WHERE is_org_level=true AND category_id=$1 AND normalize(kra_name)=normalize($2) AND normalize(kpi_name)=normalize($3) AND review_period=$4 AND review_year=$5` (no RLS — definer). Apply same case-insensitive + fuzzy fallback chain currently in `fetchTargetKpis`.
   - Compute self_score / self_rating server-side using existing rating helpers (or accept pre-computed ratings from caller as a fallback path).
   - Call into the existing `propagate_org_kpi_value` body / share its eligibility ladder so behaviour stays identical.
   - Return shape: `{ propagated, skipped, results, skipped_details }` — same as today.

2. **Frontend: `usePropagateOrgKpiValue` & `useBulkPropagateOrgKpiValues`**
   - Replace `fetchTargetKpis` + `callPropagationRpc` with a single call to `resolve_and_propagate_org_kpi`.
   - Keep audit log fire-and-forget and toast logic unchanged.
   - Remove RLS-bound `kpis` SELECT on the propagate path (keep it elsewhere).

3. **Preview parity: `preview_org_kpi_propagation`**
   - Mirror the same definer-side target resolution so the preview dialog count matches actual propagation.
   - Update `usePreviewOrgKpiPropagation` if its input contract changes (prefer keeping signature compatible).

4. **Regression tests**
   - `src/test/orgKpiPropagationCrossDept.test.ts`: data owner whose visible KPI set excludes department X still successfully propagates to employees in X.
   - Negative test: non-authorised caller is rejected by the RPC.
   - Snapshot truth test (existing) still passes.

5. **Docs & policy**
   - `POLICY.md` §111.4: "Org KPI propagation MUST resolve target KPIs server-side via SECURITY DEFINER. Client-side RLS-bound SELECT MUST NOT gate writes that are conceptually cross-departmental."
   - `DOCUMENTATION.md`: update the Org KPI Data Entry section with the new RPC and the read/write parity rule.
   - `docs/adr/ADR-062.md`: record the decision and the May 2026 incident.
   - `mem://features/admin/org-kpi-propagation-truth.md`: add the cross-department write-path rule.

## Technical Details

- Reuse `normalize_text` SQL helper if present; otherwise inline `lower(regexp_replace(coalesce($1,''), '\s+', ' ', 'g'))` and trim, matching `src/lib/orgKpiKey.ts`.
- Authorisation helper: prefer a small `is_org_kpi_data_owner(_user, _category, _kra, _kpi)` SECURITY DEFINER function for reuse and easier RLS audit.
- Keep `propagate_org_kpi_value` callable as-is for back-compat; the new RPC is a thin resolver + delegator.
- No change to `org_kpi_values` semantics; status pill truth stays driven by the snapshot's `propagatedEmpIdsByKey`.

## Out of Scope

- Backfilling the 10 currently-stuck rows (user can re-click Propagate after the fix; we can offer a one-shot admin script if requested).
- UI changes to the data entry table.
