## Why

Today, admin's Org KPI Data Entry can diverge from the Employee Dashboard:

- Manish Singh, Apr-2026, "Implementation & Adherence to common…":
  - `org_kpi_values`: `achieved=3`, evidence empty, `status=entered`
  - `review_submissions`: `achieved=0`, `self_score=5`, remarks "0 non compliance", `self_evidence_urls=NULL`, `status=manager_check`

The employee self-submitted first, then admin entered a different value. `propagate_org_kpi_value` skips any KPI whose status is in `manager_check / audit / skip_level_check / hr_pms_review / management_review / approved` (treated as "reviewer_locked"), so the admin value never reaches `review_submissions`. The OKV header also shows "4 files" by aggregating across all mapped employees while Manish's own OKV `evidence_files = []`, which is the visual mismatch in the screenshot.

User decision: **OKV is the source of truth.** Admin save must overwrite the employee's self value, remarks and evidence, and step the KPI back to `self_review` (so the existing reviewer chain re-runs). Approved rows stay immutable. Header chip stays as-is (aggregate).

## Risk & Impact Report

- **Data**: `review_submissions.self_value / self_score / self_rating / self_remarks / self_evidence_urls / self_evidence_url / is_na` get overwritten for non-approved rows. `kpis.status` regresses to `self_review`. `final_score` is never touched (approved rows are excluded — preserves immutability per memory).
- **Workflow**: KPIs in `manager_check / audit / skip_level_check / hr_pms_review / management_review` are sent back to `self_review`. Reviewer queues will re-surface these rows. This is intentional but a real workflow regression for those reviewers.
- **UX**: Save+Propagate gets a confirm dialog ("This will overwrite N employees' self-submitted data and reset their review to Self-Review") gated by `ConfirmDestructiveDialog`.
- **Regression**: Old "safe" / "pre_review_only" callers untouched — new policy is opt-in.
- **Audit**: every overwrite writes `ORG_KPI_VALUE_OVERWRITTEN` with the prior status, prior self_score, prior remarks and prior evidence URLs so it's fully reversible from logs.
- **Approved rows**: still skipped (`reason: 'approved_immutable'`) — surfaced in the result toast.

## Plan

### 1. DB — `propagate_org_kpi_value` gets a new policy

`supabase/migrations/<ts>_okv_overwrite_stepback.sql`

- Add `'overwrite_and_stepback'` to the policy whitelist.
- When that policy is active:
  - Allow current status in everything **except** `'approved'`.
  - `v_target_status := 'self_review'` for any current status above `'self_review'` (step-back); for `kra_set` keep `'self_review'`; for `self_review` stay put.
  - `ON CONFLICT … DO UPDATE` drops the `COALESCE` for this policy and **unconditionally** overwrites `self_evidence_url`, `self_evidence_urls`, `self_remarks`, `is_na` from the OKV payload (NULL = clear).
  - On step-back, also `UPDATE review_submissions SET manager_score=NULL, manager_remarks=NULL, auditor_score=NULL, … = NULL` for every reviewer column at-or-after the prior status (mirrors existing send-back contract — re-use the helper used by `Rollback Request Management` if available, else inline).
  - Audit log payload extended with `prior_self_score / prior_self_remarks / prior_self_evidence_urls / prior_status`, action `ORG_KPI_VALUE_OVERWRITTEN`.
- Approved → `skipped` with `reason='approved_immutable'`.

### 2. Hook — `usePropagateOrgKpiValue`

`src/hooks/usePropagateOrgKpiValue.ts`

- Add `overwritePolicy?: 'safe' | 'pre_review_only' | 'force_pre_terminal' | 'overwrite_and_stepback'` to the mutation params.
- Pass through to the RPC's `p_overwrite_policy`.
- Return shape unchanged; add `overwrittenCount` derived from `results[].prior_status !== 'kra_set'`.

### 3. Page — `src/pages/admin/OrgKpiDataEntry.tsx`

- Replace single "Save & Propagate" button behaviour with a two-step flow:
  1. On click → run a lightweight pre-check (already-available `preview_org_kpi_propagation` + a new client-side count of rows whose status is past `self_review` and not `approved`).
  2. If the "overwrite count" > 0, open `ConfirmDestructiveDialog` with body: *"X employees have already submitted their self-review (some are with their manager/auditor). Saving will overwrite their values and reset their review back to Self-Review. Approved rows will be skipped. Continue?"*
  3. On confirm → call `propagate.mutateAsync({ ..., overwritePolicy: 'overwrite_and_stepback' })`.
- After success toast, if `result.skipped_details` contains `approved_immutable`, surface a secondary amber toast listing the affected employee names.
- Save handler also resyncs evidence: after a successful propagate for an OKV row, call existing `resync_org_kpi_evidence(okvId, 'replace_with_stepback')` so per-employee `self_evidence_urls` mirror OKV `evidence_files`.

### 4. Card — `src/components/admin/OrgKpiEntryCard.tsx`

- No header chip changes (user kept aggregate behaviour).
- Add a small inline banner inside the per-employee row when `submission.status` was past `self_review` at save-time, e.g. *"Self-review will be reset on Save"* — purely informational, computed from `mappedSubmissionMap`.

### 5. Tests

- `src/test/orgKpiPropagateOverwriteStepback.contract.test.ts` — locks SQL contract: presence of `'overwrite_and_stepback'`, exclusion of `approved`, step-back target, unconditional self_* overwrite, audit metadata fields.
- `src/test/orgKpiOverwriteConfirmGuard.test.tsx` — render the page with a mocked row at `status='manager_check'`, click Save+Propagate → assert `ConfirmDestructiveDialog` opens with the overwrite count, and that confirming calls the hook with `overwritePolicy: 'overwrite_and_stepback'`.
- Extend `orgKpiPropagateResultContract.test.ts` with the new `overwrittenCount` field.

### 6. Docs

- `DOCUMENTATION.md` → add "OKV-as-source-of-truth" section under Org KPI Data Entry.
- `POLICY.md` → new clause: "Admin Org KPI value overrides any employee self-submission below Approved. Step-back to Self-Review is mandatory and audited."
- New ADR-064 capturing the decision + RCA from this thread.
- Memory updates: `mem://features/admin/org-kpi-propagation-truth.md` (extend) and `mem://features/admin/org-kpi-data-entry-snapshot` cross-reference.

## Out of scope (intentionally)

- Header chip semantics — user kept aggregate behaviour.
- Yesterday's lazy-ensure fix is unrelated and stays.
- No change to evidence per-file targeting (ADR-060 stays).
- Approved rows remain immutable.
