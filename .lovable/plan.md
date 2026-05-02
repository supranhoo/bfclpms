## Problem

Two real gaps in **Build Registry → Duplicate Scanner**:

1. **Approved groups reappear after Re-scan.** Approval only writes to `kpi_definitions` + `kpi_name_aliases`. The scanner (`scan_kpi_duplicate_groups`) reads raw `kpis` rows and has no idea those (KRA, KPI) pairs are now linked to a canonical entry. So they show up again exactly as before.
2. **No "Don't Merge" option.** The scanner sometimes shows two variants that are genuinely different KPIs (just similar wording). Today the only way to dismiss them is to approve as canonical (wrong) or ignore them forever (they keep coming back). Local React `processedGroups` state is lost on refresh / Re-scan.

## Risk & Impact Report

- **Data Impact**: Adds one new table `kpi_scanner_skips` (admin-only, RLS). No change to `kpis`, `kpi_definitions`, `kpi_name_aliases`. Pre-May-2026 frozen rule unaffected.
- **Workflow Impact**: None for non-admin users. Admins gain one new action ("Skip"); existing "Approve as Canonical" unchanged.
- **UI/UX Consistency**: Reuses existing button + Badge + ConfirmDestructiveDialog patterns. No layout shift.
- **Regression Risk**: Low. Scanner logic change is additive (extra anti-join filters); covered by new tests. Skip table is opt-in — empty by default = same behaviour as today.
- **Mitigation**: Unit tests for both filter paths (alias-linked, skip-marked) + an "Include skipped" toggle so admins can always re-surface a skipped group.

## What changes

### 1. Scanner becomes alias-aware

Update `scan_kpi_duplicate_groups` so a `(category_id, kra_name, kpi_name)` variant is excluded when it already appears in `kpi_name_aliases`. After exclusion, if a group has fewer than 2 distinct KRA names left, the whole group drops out.

Why this is safe: aliases are the canonical record of "this variant has been standardised". Using them as the filter source means the scanner stays in sync the moment an admin clicks **Approve as Canonical** — no extra backfill needed, no dependency on the BEFORE trigger having stamped historical `kpis` rows.

### 2. Persistent "Skip / Don't Merge" action

New table `kpi_scanner_skips`:

```text
id              uuid PK
category_id     uuid
normalized_kpi  text     -- LOWER(TRIM(kpi_name)), matches scanner grouping
skipped_by      uuid     -- auth.uid()
skipped_at      timestamptz
reason          text     -- optional admin note
UNIQUE (category_id, normalized_kpi)
```

- RLS: admin-only SELECT/INSERT/DELETE. No UPDATE.
- Scanner excludes any group whose `(cat_id, norm_kpi)` is in this table.
- Scanner accepts a new boolean arg `p_include_skipped` (default `false`) so the UI can offer an "Include skipped groups" toggle.
- Action is reversible: an "Un-skip" button removes the row, and the next scan brings the group back.
- Logged into existing `kpi_standardization_actions` so it appears in History & Undo with the same dim/restore pattern as other actions.

### 3. UI (Build Registry tab)

- Add a secondary **Skip ("Don't merge")** button next to **Approve as Canonical** on every group card. Opens `ConfirmDestructiveDialog` (consistent with policy §safety). Optional reason textarea.
- Header badge becomes: `N pending / M skipped / T total groups`.
- Add an "Include skipped" toggle (off by default). When on, skipped groups render dimmed with an **Un-skip** button instead of Approve/Skip.
- Toast on success: "Group skipped. You can restore it from History & Undo or by toggling 'Include skipped'."

### 4. Tests + docs

- `src/lib/scanGroupsDedup.test.ts` already covers variant collapse — extend with a test that an alias-matched variant is filtered out client-side as a defence-in-depth check (mirrors existing dedup pattern).
- New `src/hooks/useScannerSkips.test.ts` — covers create, list, un-skip, and the include-skipped flag.
- Update `mem/features/admin/kpi-standardization-registry`, `POLICY.md` §88I, and `DOCUMENTATION.md` to record the new invariant: *the scanner must never re-emit a group whose variants are all aliased OR whose normalized signature has been explicitly skipped.*

## Files

**SQL (new migration)**
- `supabase/migrations/<ts>_scanner_alias_and_skip.sql`
  - Create `kpi_scanner_skips` + RLS
  - Rewrite `scan_kpi_duplicate_groups(p_include_skipped boolean DEFAULT false)` with alias anti-join + skip anti-join

**Hooks**
- `src/hooks/useKpiRegistry.ts` — add `useScannerSkips` (list / add / remove), pass `p_include_skipped` from `useScanDuplicates`
- `src/hooks/useScannerSkips.test.ts` (new)

**Client utility**
- `src/lib/scanGroupsDedup.ts` — extend with `filterAliasedVariants(groups, aliases)` defence-in-depth pass
- `src/lib/scanGroupsDedup.test.ts` — extend tests

**UI**
- `src/components/admin/kpi-standardization/BuildRegistryTab.tsx` — Skip button, Include-skipped toggle, Un-skip button, badge counts
- `src/components/admin/kpi-standardization/HistoryUndoTab.tsx` — render the new `skip_group` / `unskip_group` action types

**Docs**
- `POLICY.md` §88I (clauses 10 + 11)
- `DOCUMENTATION.md` (KPI Standardization section)
- `mem/features/admin/kpi-standardization-registry`

## Out of scope

- No change to pre-May-2026 frozen data.
- No automatic backfill of `kpis.kpi_definition_id` (separate concern; the alias-anti-join makes it unnecessary for the scanner).
- Registry Browser and `get_public_registry_view` unchanged.
