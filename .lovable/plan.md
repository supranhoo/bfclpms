
## Goal

Make the **Bulk Sign-off** dialog (`BulkApproveDialog` in `signoff` mode) significantly wider and reshape the **Per-cell preview** table so every reviewer level is visible in one row, instead of a single collapsed "Score / Source" pair.

Scope is UI-only — no RPC, schema, or scoring-logic changes. The carried-score resolver continues to drive the final write payload; we only surface more data that is already in `loadedRows` (every stage column is fetched today but discarded in `buildBulkSignoffImpact`).

## Risk & Impact Report

- **Data Impact:** None. No schema, RLS, or write contract change.
- **Workflow Impact:** None. Sign-off RPC payload is identical (still carries one resolved score per cell + remark + evidence).
- **UI/UX Impact:** Dialog grows from `sm:max-w-3xl` (~768 px) to a wide responsive shell capped at viewport width. Per-cell table gains 6 stage columns + KRA + Target + UoM. Below `lg` (≤1024 px) it falls back to horizontal scroll inside the table region (dialog body stays vertically scrollable). Mobile card layout gets the same six pills.
- **Regression Risk:** Low. `BulkApproveDialog` is used in two modes (`approve` and `signoff`); only `signoff` rendering of `BulkSignoffPreview` is touched. `approve` mode is unchanged. `CellPreview` gets new optional fields → no breaking consumer.
- **Scalability:** Per-cell table already virtually-capped at the page selection (typ. ≤200 cells). Sticky header + `max-h-[60vh]` overflow keeps render cost flat. No new queries.
- **Mitigation:** Six new fields on `CellPreview` are all `number | null` and additive; existing tests stay green. New rendering covered by component test for the six-stage row.

## UI Plan (Detailed)

### 1. Dialog shell — bigger, calmer

`src/components/review/BulkApproveDialog.tsx`

- Replace `DialogContent` class for **signoff mode only**:
  - From: `sm:max-w-3xl max-h-[90vh] overflow-y-auto`
  - To:   `w-[98vw] sm:max-w-[1400px] max-h-[92vh] p-0 gap-0 flex flex-col`
- Approve-mode keeps current width (no regression).
- Internal layout becomes three vertical regions:
  1. **Header** — sticky top, padded, current copy unchanged.
  2. **Body** — single scroll container (`flex-1 overflow-y-auto px-6 py-4 space-y-4`) hosting badges strip → per-cell table → legend → per-employee rollup → remark + evidence + override.
  3. **Footer** — sticky bottom (`border-t bg-background/95 backdrop-blur px-6 py-3`) with Cancel + primary button.
- Switching header/footer to sticky avoids the current "everything scrolls together" feel and keeps the primary CTA always visible on the wider canvas.

### 2. Per-cell preview — all levels in one row

`src/components/review/BulkSignoffPreview.tsx` + `src/lib/bulkSignoffImpact.ts`

Extend `CellPreview` (additive, optional) with the raw stage scores already present on `SnapshotCell`:

```text
+ kra_name:         string;
+ uom:              string | null;
+ target_value:     number | null;
+ achieved_current: number | string | null;   // live achieved_value
+ stageScores: {
+   self:        number | null;
+   manager:     number | null;
+   skip_level:  number | null;
+   hr_pms:      number | null;
+   auditor:     number | null;
+   management:  number | null;
+   final:       number | null;
+ };
```

`buildBulkSignoffImpact` copies these straight from each `SnapshotCell` — no extra fetch, no math change. `kra_name`, `uom`, `target_value` come from `loadedRows` / `ruleByKpiId` already in scope.

New desktop table layout (sticky first 2 columns, scroll-x within the bordered region):

```text
┌─────────────┬──────────────┬─────────┬───────┬─────┬────────┬──────────┬─────┬─────┬───────┬───────┬────────┬────────┬─────────┬─────────┬──────┬────────┐
│ Employee    │ KRA · KPI    │ UoM     │ Tgt   │ Wt% │ Achvd  │ Achieved │ Self│ Mgr │ Skip  │ HR PMS│ Auditor│ Mgmt   │ Final   │ Resolv. │ Src  │ Impact │
│             │              │         │       │     │ (live) │ override │     │     │ Lvl   │       │        │        │         │ score   │      │        │
└─────────────┴──────────────┴─────────┴───────┴─────┴────────┴──────────┴─────┴─────┴───────┴───────┴────────┴────────┴─────────┴─────────┴──────┴────────┘
```

- Each stage cell shows the numeric score with subtle color coding (≥4 emerald, ≥3 muted-fg, &lt;3 destructive). Empty → `—` in `text-muted-foreground/60`.
- The **target stage column** (e.g. HR PMS during the screenshot) is highlighted with a thin left/right border in `border-primary` to make "this is what we're stamping" obvious.
- "Resolved score" column = the value the RPC will write (current `c.score`) and keeps the existing `SourceBadge`.
- "Achieved override" input only renders when `isRowEditable(c)` is true (same condition as today).
- Row striping unchanged; `bg-destructive/5` on `source='none'`, `bg-amber-500/5` on `source='override'`.
- Table region: `max-h-[60vh] overflow-auto` with `sticky top-0` thead.
- Below `lg` the table sets `min-w-[1280px]` and the wrapper allows `overflow-x-auto`, so on a 1080-px viewport it scrolls horizontally instead of breaking the layout. Mobile (`md:hidden`) cards keep stacked layout but list the six stages in a 3×2 mini-grid below the existing KPI line.

### 3. Per-employee rollup — unchanged math, two extra columns

Add `Self avg`, `Mgr avg` columns alongside existing `Current → Projected` so reviewers can spot where the variance is coming from without opening each row. Pulled from `perEmployee` aggregator (extend with two more numeric accumulators, additive).

### 4. Visual / a11y polish

- Replace the badges strip with a more compact pill row (`h-6 px-2`) so the wider header doesn't feel empty.
- Add `aria-label="Per-cell scoring across all review levels"` on the per-cell `<table>`.
- Respect `prefers-reduced-motion`: no new animations.
- Keep all colors as semantic Tailwind tokens (no hex).

## Technical Section

Files touched (no schema, no RPC, no migration):

- `src/components/review/BulkApproveDialog.tsx`
  - Conditional wider `DialogContent` className + sticky header/footer wrapper (signoff mode only).
- `src/components/review/BulkSignoffPreview.tsx`
  - Replace `CellTable` columns; add stage cell renderer; mark target stage; add 3×2 stage grid in mobile card.
  - Extend `EmployeeRollupTable` with two columns.
- `src/lib/bulkSignoffImpact.ts`
  - Extend `CellPreview` and `EmployeeRollup` interfaces (additive optional fields).
  - Copy stage scores from `SnapshotCell` into preview; aggregate `selfAvg` / `managerAvg` per employee. Pure functions, deterministic.
- `src/lib/bulkSignoffImpact.test.ts`
  - Add 2 cases: (a) per-cell preview surfaces all six stage scores; (b) per-employee `selfAvg`/`managerAvg` weighted-average matches spec.
- `src/test/bulkApproveDialogSignoffMode.test.tsx`
  - Add 1 case: dialog renders with the wider shell when `mode='signoff'` and stage column highlight is present.

Out of scope (do **not** touch):
- `bulk_write_stage_scores` RPC, `useBulkWriteStageScores`, `useBulkReopenCells`.
- Carried-score resolver — write payload still uses single resolved value.
- `BulkCellDrawer` (single-cell side sheet); unrelated to this dialog.
- Backup engine, RLS, migrations.

## Verification Steps

1. `bunx vitest run src/lib/bulkSignoffImpact.test.ts src/test/bulkApproveDialogSignoffMode.test.tsx` → all green.
2. Manual: open Bulk Sign-off as HR PMS on the same dataset in the screenshot. Confirm:
   - Dialog spans ~1400 px on a 1920 viewport; ~98 vw on a 1080 viewport.
   - Six stage columns visible with HR PMS column highlighted.
   - Approve-mode dialog (terminal Management approval) is visually unchanged.
3. Mobile preview (375 px): per-cell stacks into cards; stage mini-grid readable; no horizontal page scroll.
4. Re-run sign-off end-to-end on 2 cells — payload + audit trail identical to pre-change.

## Documentation & Policy

- `DOCUMENTATION.md` → "Bulk Sign-off Dialog" section: note the new column layout and that all stage scores are now visible at preview time.
- `POLICY.md` → no change. Scoring contract (§88, §111.7.a) is untouched; only presentation is broader.

## Post-Implementation Notes

- If reviewers later want to **edit** any stage column inline from this table (not just achieved override), that is a separate feature requiring RPC changes and policy review — **not** included here.
