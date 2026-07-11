
# Plan — Scoped KRA Deletion from Review Card (with reconfirmation)

Replace the current single-shot "Delete KRA" confirmation with a scope-aware dialog that lets the actor delete the KRA row for the current month only, for every month it exists, or for the current month plus every later month — and require an explicit **reconfirmation step** before any DELETE runs.

## Risk & Impact Report

- **Data Impact:** Deletes rows from `public.kpis` for the same employee + KRA + KPI across one or many periods. Cascades already remove `review_submissions` and history per today's behavior. Additive: current path is `scope='month'` and stays byte-identical.
- **Workflow Impact:** No workflow change. Delete permission still gated by `useDashboardKraPermissions().canDelete || isAdmin`.
- **UI Impact:** The existing `ConfirmDestructiveDialog` on this KRA card is swapped for a two-step dialog: scope picker → destructive reconfirm.
- **Regression Risk:** Low. Scope resolution uses `.select('id, review_period, review_year')` filtered on `employee_id + kra_name + kpi_name` (the canonical identity per `mem://.../duplicate-kpi-prevention-constraint`). Batch delete uses `in('id', ids)`.
- **Scalability:** Bounded by months a KRA exists for one employee (~24). No pagination.
- **Rollback:** Additive — revert two edited files + delete the new hook/dialog/test files.

## Scope

### 1. Scope semantics (calendar-ordered)

- **`month`** — delete only the currently opened `kpi.id`.
- **`all`** — delete every row matching `employee_id + kra_name + kpi_name` (any period/year).
- **`from`** — delete rows where `(review_year, monthIdx) >= (currentYear, currentMonthIdx)` for the same identity, current row included.

Past-month rows (already reviewed) are never touched by `from` or `month`.

### 2. Two-step confirmation flow

Step 1 — **Scope picker** (chooses what to delete, no side effects):

```text
┌──────────────────────────────────────────────────────────────┐
│  Delete this KRA?                                        [x] │
├──────────────────────────────────────────────────────────────┤
│  Choose which occurrences of                                 │
│  "Training & Development — Identification & Consolidation…"  │
│  for Ankit Choudhary you want to delete.                     │
│                                                              │
│  ( • ) This month only                     — Jun 2026   (1)  │
│  (   ) This and following months only      — Jun 2026 →  (4) │
│  (   ) All months                          —            (11) │
│                                                              │
│                        [ Cancel ]   [  Continue  ]           │
└──────────────────────────────────────────────────────────────┘
```

Continue is disabled while sibling counts load or when the chosen scope resolves to zero rows.

Step 2 — **Reconfirmation** (explicit destructive gate before DELETE):

```text
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Confirm permanent deletion                          [x] │
├──────────────────────────────────────────────────────────────┤
│  You are about to permanently delete this KRA and all its    │
│  review submissions and history for:                         │
│                                                              │
│    Employee : Ankit Choudhary (200679)                       │
│    KRA/KPI  : Training & Development — Identification …      │
│    Scope    : This and following months only                 │
│    Months   : Jun 2026, Jul 2026, Aug 2026, Sep 2026         │
│    Rows     : 4                                              │
│                                                              │
│  This cannot be undone.                                      │
│                                                              │
│  Type  DELETE  to confirm:                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│                     [ Back ]   [  Delete 4 rows  ]           │
└──────────────────────────────────────────────────────────────┘
```

Rules:
- The destructive button stays **disabled** until the user types `DELETE` (exact, case-sensitive) into the confirm input.
- **Back** returns to step 1 (scope + counts preserved). **Cancel/close** aborts without side effects.
- On success: toast `Deleted N rows for "<KRA> — <KPI>"`. Dialog closes.
- On error: toast destructive; dialog stays open on step 2 so the user can retry or Back out.

### 3. New hook — `useAdminDeleteKpiScoped`

Location: extend `src/hooks/useKpis.ts`.

```ts
mutate({
  kpiId: string;
  employeeId: string;
  kraName: string;
  kpiName: string;
  currentPeriod: string;   // "June"
  currentYear: number;     // 2026
  scope: 'month' | 'all' | 'from';
  ids: string[];           // resolved by dialog from useKraSiblingIds
})
```

Flow:
1. Guard: `ids.length === 0` → throw "Nothing to delete".
2. `.delete().in('id', ids)`.
3. Invalidate the same keys as `useAdminDeleteKpi` today (`kpis`, `my-kpis`, `all-kpis`, `kpis-by-period`).
4. Return `{ deleted: ids.length }` for the toast.

A companion hook `useKraSiblingIds(kpi, currentPeriod, currentYear, enabled)` loads once when step 1 opens and returns `{ all, from, month, monthsByScope }`. Consumed by both the labels in step 1 and the row summary in step 2. Pure helper `resolveKraDeletionIds(siblings, scope, current)` is exported for tests.

### 4. New component — `KraDeleteScopeDialog`

New file `src/components/review/KraDeleteScopeDialog.tsx`. Owns local `step: 1 | 2`, selected `scope`, `confirmText`, mutation state. Keeps `KpiHeaderSection.tsx` lean.

### 5. Wiring — `src/components/review/KpiHeaderSection.tsx`

- Replace the `<ConfirmDestructiveDialog>` block (lines ~326–339) with `<KraDeleteScopeDialog>` passing `kpi`, `employeeName`, `selectedPeriod`, `selectedYear`, `open`, `onOpenChange`.
- Remove the direct `deleteKpi.mutate(kpi.id, …)` call — the new dialog owns the mutation and closes itself on success.

### 6. Tests

New `src/test/kraDeleteScope.test.ts` — pure unit tests for `resolveKraDeletionIds`:
- `month` returns `[currentId]` regardless of siblings.
- `all` returns every id (past + current + future).
- `from` returns current + strictly-later `(year, monthIdx)`, excludes earlier.
- Boundary: `(year, month)` equal to current is included in `from`.
- Cross-year: `Dec 2025` includes `Jan 2026`, excludes `Nov 2025`.

Plus an interaction test `src/test/kraDeleteScopeDialog.test.tsx`:
- Continue disabled while counts loading.
- Step 2 delete button disabled until user types `DELETE`.
- Back returns to step 1 with scope preserved.
- Cancel on step 2 does not call the mutation.

### 7. Files

**New**
- `src/components/review/KraDeleteScopeDialog.tsx`
- `src/test/kraDeleteScope.test.ts`
- `src/test/kraDeleteScopeDialog.test.tsx`

**Edited**
- `src/hooks/useKpis.ts` — add `resolveKraDeletionIds`, `useKraSiblingIds`, `useAdminDeleteKpiScoped`.
- `src/components/review/KpiHeaderSection.tsx` — swap in the new dialog.

**Docs**
- `DOCUMENTATION.md` + `.lovable/plan.md` — record scoped-delete semantics and the mandatory two-step DELETE confirmation.

## Not Applicable
Offline / optimistic UI (destructive), pagination (bounded per identity), migration (no schema change).
