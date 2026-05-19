## Goal

Eliminate the page-load storm on `/admin/org-kpi-data` introduced yesterday, while keeping the Supporting / Parity / Manage Files parity for cards whose mapped employees have no `org_kpi_values` row yet. Strategy: **lazy on-demand materialisation** — never hit the RPC on card mount; only fire it the moment the admin actually opens the file-management UI for that KPI.

## Risk & Impact Report

- **Data Impact:** None during page load. OKV scaffold rows are created only when admin clicks "Manage files" / opens the evidence sheet for that specific card. Existing rows are still untouched.
- **Workflow Impact:** None. Scaffolds remain value-less; no workflow advancement.
- **UI/UX Consistency:** Card headers continue to show Supporting/Parity chips for admin in dept/employee scope (same as today). The chips render in a neutral "not yet materialised" state when no OKV row exists; clicking them triggers materialisation + opens the sheet. Employees and other roles are unaffected.
- **Regression Risk:** Low. We remove a hot-path effect; no other code calls `useEnsureOrgKpiScopeRows` yet. The RPC itself is unchanged (already idempotent + SECURITY DEFINER gated).
- **Performance Win:** From up to **183 concurrent RPC calls + ~900 cache invalidations on every page open** → **0 RPC calls on page open**, plus 1 RPC + 5 invalidations only when admin clicks a specific card's file controls. Brings Org KPI Data Entry back to its pre-fix load profile.

## Implementation

### 1. `OrgKpiEntryCard.tsx`

- **Remove** the on-mount `useEffect` that calls `ensureScopeRows.mutate(...)` and the `didEnsureRef` guard.
- **Keep** the import and the `ensureScopeRows = useEnsureOrgKpiScopeRows()` declaration.
- **Keep** the `hasEvidenceControls` gate as `scopedOkvIds.length > 0 || !!isAdmin` so the chip cluster still renders for admin.
- Add a small helper:
  ```ts
  const ensureScopeRowsIfNeeded = useCallback(async () => {
    if (data.scope === 'organization') return;
    if (scopedOkvIds.length > 0) return;
    if (!isAdmin) return;
    await ensureScopeRows.mutateAsync({
      categoryId: data.categoryId,
      kraName: data.kraName,
      kpiName: data.kpiName,
      reviewPeriod, reviewYear,
    });
  }, [...]);
  ```
- Wrap the three chip click handlers (Status chip, Parity badge, "Manage files" button) so they `await ensureScopeRowsIfNeeded()` BEFORE calling `setShowEvidenceSheet(true)`. The first click materialises and opens; subsequent clicks open instantly because the cache is now populated.
- Add a subtle `isPending` visual hint on the "Manage files" button only while the ensure RPC is running for that specific card (e.g. spinner + "Preparing…" label). No global blocker.

### 2. `OrgKpiEvidenceManagerSheet.tsx`

- No code change required — by the time the sheet opens, OKV rows exist and the existing `useOrgKpiEvidenceFiles` / `useOrgKpiEvidenceCounts` hooks work normally.
- Optional safety: if `scopedOkvIds.length === 0` at sheet-open time (race), show a "Materialising rows…" skeleton until invalidation refetch completes. Not strictly required since we `await` the RPC before opening.

### 3. Optional cosmetic — "Supporting" chip pre-materialisation state

When no OKV rows exist yet, the chip currently shows "No supporting" (amber). That's already accurate — there genuinely is no admin-side supporting file on file. We'll leave the label as-is; the first click on Manage Files will both materialise and reveal any employee-uploaded files seeded by the RPC.

### 4. Tests

- `orgKpiEntryCardLazyEnsure.test.tsx` — three behaviours, mocking `useEnsureOrgKpiScopeRows`:
  1. Mounting a card with empty `scopedOkvIds` does **NOT** call the ensure mutation.
  2. Clicking "Manage files" on such a card calls ensure exactly once and then opens the sheet.
  3. Clicking "Manage files" on a card that already has OKV rows does NOT call ensure.
- `ensureRpcLoadProtection.test.ts` — static guard: assert the `OrgKpiEntryCard` source contains no `useEffect` that calls `ensureScopeRows`. Prevents regression.

### 5. Docs

- `DOCUMENTATION.md` — update the "OKV lazy materialisation" subsection: trigger is now user click, not mount; rationale is page-load cost (183 KPIs × N employees).
- `POLICY.md` — keep the two-way parity rule; tweak wording to: "OKV scaffolds are created on first admin interaction with the file-management UI, not on page open."
- Version History entry.

### 6. Out of Scope (deferred)

- Bulk RPC variant for batch use cases.
- Further page-level query consolidation on Org KPI Data Entry (separate optimisation pass).
- Compute upgrade recommendation — the storm was the cause, not compute size; we'll re-evaluate after this fix.

## Files Touched

```text
src/components/admin/OrgKpiEntryCard.tsx                   (remove effect, gate clicks)
src/test/orgKpiEntryCardLazyEnsure.test.tsx                (new)
src/test/ensureRpcLoadProtection.test.ts                   (new regression guard)
DOCUMENTATION.md, POLICY.md                                (sync)
```
