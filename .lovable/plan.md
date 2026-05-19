## Goal

In `OrgKpiDataEntry` (admin), every KPI card must always show the **Supporting / Parity / Manage files** controls — even when no `org_kpi_values` (OKV) row has been created yet. When the only existing data is on the employee's `review_submissions` (self-submitted evidence + remarks), the admin side should mirror it. The fix: lazily create one minimal OKV row per mapped employee on first view of the KPI in admin, and copy any self-submitted evidence onto it.

## Risk & Impact Report

- **Data Impact:** Writes new rows into `public.org_kpi_values` (one per mapped employee, per period). Rows are minimal (no `achieved_value`, no `is_na`), status defaults; no historical data is mutated. Existing OKV rows for the same `(category_id, kra_name, kpi_name, review_period, review_year, department_id, employee_id)` are left alone — uniqueness already enforced (constraint + 23505 retry path in `useOrgKpiValues`).
- **Workflow Impact:** None. The auto-created OKV row has no value, so propagation / scorecard / weighted-score paths still treat it as "missing staging value" (existing `diagnose_org_kpi_propagation_gap` classification `missing_staging_value`). No KPI is auto-advanced.
- **Evidence transfer:** Copies `review_submissions.self_evidence_urls` (or singular `self_evidence_url`) into the OKV's `evidence_urls` field **only when the OKV row is being created fresh** and is currently empty. Never overwrites admin-entered evidence. Files in storage are not re-uploaded — only URL references are linked.
- **UI/UX Consistency:** The two header chips + "Manage files" button now render for every dept/employee scoped card. No layout change; just removes an inconsistency users currently see.
- **Regression Risk:** Low — guarded by an idempotent server-side RPC (uses `ON CONFLICT DO NOTHING`); no client save flow changes. Existing parity/repair RPCs continue to work because they key off the same OKV row.
- **Mitigation:** New RPC is SECURITY DEFINER + admin/data-owner gated (same pattern as `repair_org_kpi_entered_unpropagated_rows`). Unit tests for fresh-row creation, no-overwrite of existing data, evidence-URL seeding, and idempotency.

## Implementation

### 1. DB — new RPC `ensure_org_kpi_scope_rows`

```text
ensure_org_kpi_scope_rows(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year int
) RETURNS jsonb
```

Behavior (idempotent):
1. AuthZ: caller must be admin OR assigned data-owner for `(category, kra, kpi)`. Otherwise raise.
2. Resolve mapped employees for this KPI (same logic the diagnose RPC uses).
3. For each mapped employee, `INSERT INTO org_kpi_values (...) ON CONFLICT (category_id, kra_name, kpi_name, review_period, review_year, department_id, employee_id) DO NOTHING`. New rows carry NULL `achieved_value`, `is_na=false`, default status (`pending`/`entered_pending` — match what the propagate RPC expects for a "not yet entered" row; verify against current enum).
4. For each row that was inserted (or for any existing OKV row whose `evidence_urls` is NULL/empty AND whose `evidence_url` is NULL), look up the matching `review_submissions` row (same employee + period + KPI) and copy `self_evidence_urls`/`self_evidence_url` into `evidence_urls`. Never overwrite a non-empty evidence field.
5. Return `{ created: int, evidence_seeded: int, already_existed: int }`.

RLS: function runs SECURITY DEFINER, search_path locked.

### 2. Hook — `useEnsureOrgKpiScopeRows`

Thin wrapper that calls the RPC and invalidates: `['org-kpi-values']`, `['org-kpi-evidence-files']`, `['org-kpi-evidence-counts']`, `['org-kpi-evidence-parity']`, `['org-kpi-submission-fallback']`.

### 3. UI — `OrgKpiEntryCard.tsx`

- Add an effect (in `OrgKpiEntryCard`, scoped to `data.scope !== 'organization'`) that fires the RPC **once per card mount** when `scopedOkvIds.length === 0` AND the card has at least one mapped employee. Guarded by `isAdmin` (don't run for read-only roles). Debounced via mutation `mutateAsync` + a `ref` flag.
- Until the RPC resolves, render the chip cluster in a neutral "loading" state instead of hiding it. After resolve, the queries refetch and chips populate.
- Remove the `hasEvidenceControls` gate's `scopedOkvIds.length > 0` clause for admins — replace with `scopedOkvIds.length > 0 || isAdmin` so the cluster renders even mid-creation. Non-admins keep the existing gate.

### 4. Tests

- `ensureOrgKpiScopeRows.test.ts` — RPC contract: idempotent on second call, no overwrite of existing `achieved_value` / `evidence_urls`, seeds from `self_evidence_urls` only on fresh insert, AuthZ rejects non-admin non-owner.
- `orgKpiEntryCardEnsureRows.test.tsx` — cards with no OKV rows fire the ensure RPC exactly once; cards with existing rows do not fire it; non-admin role does not fire it.
- Snapshot update: header always renders Supporting/Parity/Manage files for admin in dept/employee scope.

### 5. Docs

- `DOCUMENTATION.md` — add subsection "OKV lazy materialisation" under Org KPI Data Entry, with the precedence table updated: OKV row presence is now guaranteed for admin views; values/remarks still follow the parity rule (admin OKV wins, employee submission fills gaps).
- `POLICY.md` — record: "Viewing an Org KPI as admin guarantees an OKV scaffold for every mapped employee. Scaffolds carry no value and do not advance workflow."
- Version History entry.

## Files Touched

```text
supabase/migrations/<ts>_ensure_org_kpi_scope_rows.sql        (new RPC)
src/hooks/useEnsureOrgKpiScopeRows.ts                          (new)
src/components/admin/OrgKpiEntryCard.tsx                       (effect + gate)
src/test/ensureOrgKpiScopeRows.test.ts                         (new)
src/test/orgKpiEntryCardEnsureRows.test.tsx                    (new)
DOCUMENTATION.md, POLICY.md                                    (sync)
```

## Out of Scope

- No change to existing Propagate / Save / Repair Gap behaviors.
- No automatic copying of employee `achieved_value` into OKV — admin still chooses to Save or use Repair Gap for that.
- Storage buckets and file-permission rules unchanged; we only re-reference URLs already accessible to the org KPI scope.
