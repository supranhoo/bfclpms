# Problem

In `/review/bulk-scoring`, the **All KRAs** filter dropdown is empty (shows only "All KRAs") even though the scope preview reports 2,238 KPIs across 146 employees for April 2026. The dropdown should list every distinct `kra_name` available in the current scope.

# Root Cause

`useBulkReviewKraOptions` (in `src/hooks/useBulkReview.ts`, lines 190–219) queries the `kpis` table **directly via the Supabase client**:

```ts
supabase.from('kpis').select('kra_name').eq('review_period', period)…
```

The matrix grid itself loads through the SECURITY DEFINER RPC `bulk_review_snapshot`, which bypasses RLS and returns every cell in scope. The direct `kpis` SELECT does **not** — RLS on `kpis` restricts a Manager (the role shown in the screenshot) to only their own / direct-report rows, and even that is gated on the per-employee workflow resolution. For a broad cross-org scope (146 employees, mostly outside the manager's direct chain), the SELECT returns zero rows, so the distinct `kra_name` set is empty.

This is also a layering violation of the Bulk Review contract — every read on this screen is supposed to go through the gated RPC; this hook is the only direct table read left.

# Fix (minimal, surgical)

Derive the KRA option list from the **already-loaded snapshot rows** instead of a separate RLS-bound query. The snapshot is the same data the grid renders, so the dropdown will always exactly match what's visible after Load Scope.

### `src/hooks/useBulkReview.ts`
- **Delete** `useBulkReviewKraOptions` (no longer needed).

### `src/pages/review/BulkReviewDashboard.tsx`
- Remove the `useBulkReviewKraOptions` import + call.
- Replace `kraOptions.data` with a `useMemo` that computes distinct, sorted `kra_name` values from `rawRows`, optionally narrowed by the active `categoryId` if rows carry it.
- When `scopeLoaded === false`, the dropdown shows only **All KRAs** with a small helper hint ("Load scope to see KRAs") and is disabled — same UX pattern already used for the Load button.
- Keep the existing reset effect (`setKraName('')` when Category / Period / Year change).

### `mem/features/review/bulk-review-dashboard`
- Append a v2.66.12.10 entry: KRA filter is now derived from the loaded snapshot (RPC-sourced), eliminating the last direct `kpis` SELECT on this screen and fixing the empty dropdown for non-Admin roles.

### `DOCUMENTATION.md`
- One-line changelog entry mirroring the memory note.

# Risk & Impact

- **Data:** None. Read-only derivation from existing in-memory rows.
- **RLS / RPC:** Removes a direct table read; everything funnels through `bulk_review_snapshot` (matches §0 invariants).
- **Workflow:** None.
- **UI/UX:** KRA dropdown is empty until Load Scope is clicked (intentional — matches the funnel). Disabled state + hint communicates this. After Load Scope, the dropdown is populated correctly for every role.
- **Regression risk:** Very low. One hook removed, one memoized derivation added; filter behavior (`rows.filter(r => r.kra_name === kraName)`) unchanged.
- **Scalability:** Cheaper — no extra round-trip; derivation is O(n) over rows already in memory (capped at 25k by the scope guard).

# Verification

- April / 2026, Manager role at 100% zoom → click Load Scope → open **All KRAs** dropdown → list shows every distinct KRA from the loaded matrix, sorted alphabetically.
- Pick a Category → KRA list narrows to KRAs whose rows match that category.
- Change Period or Year → KRA selection resets to All KRAs (existing behavior preserved).
- Same check as Admin and Auditor — list populates identically (RLS no longer a factor).
- Before Load Scope: dropdown shows "All KRAs" only and is disabled with hint.

# Out of Scope

- Sticky-column / horizontal-scroll fixes already shipped in v2.66.12.9.
- Filter bar layout, scope cap logic, RPC signatures, schema, migrations, tests for unrelated areas.

# Rollback

Revert the two files — no DB or contract changes.

# Not Applicable

Schema / RLS / migrations / backup / new tests (pure client-side derivation change; existing matrix tests cover the snapshot path).
