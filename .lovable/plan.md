## Goal
Add **Freq**, **R0–R5**, and a small **Criteria / UoM** column to the **View KPIs** drill-in table (`AffectedKpisTable`) so admins can verify per-employee scoring details without leaving the row, mirroring the new variant scale strip.

Today the table only shows: Employee · Period · Weightage · Status. The user wants the same scale fields visible per row so a single non-matching row inside an otherwise-uniform variant is immediately spotted (e.g. one employee on Quarterly while everyone else is Monthly).

---

## New table layout

```text
┌──────────────┬───────────┬───────┬─────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬─────────────┐
│ Employee     │ Period    │ Wt    │ Status  │ Freq │  R0  │  R1  │  R2  │  R3  │  R4  │  R5  │ Crit · UoM  │
├──────────────┼───────────┼───────┼─────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼─────────────┤
│ K Srinivasa  │ Apr 2026  │  5    │ approved│ Mon  │ <98% │ 98%  │ 98.5%│ 99%  │ 99.5%│ 100% │ Higher · %  │
│ Mandala N.R. │ Mar 2026  │  5    │ approved│ Mon  │ <98% │ 98%  │ 98.5%│ 99%  │ 99.5%│ 100% │ Higher · %  │
│ Mandala N.R. │ May 2026  │  5    │ kra_set │ Mon  │ <95% │ 95%  │ 96%  │ 97%  │ 98%  │ 100% │ Higher · %  │  ← amber
└──────────────┴───────────┴───────┴─────────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴─────────────┘
```

### Behaviour
- **Compact additional columns** at the right: `Freq · R0 · R1 · R2 · R3 · R4 · R5 · Criteria / UoM`. Tabular-nums, `text-[11px]`, `whitespace-nowrap`.
- **Outlier highlighting (optional, scoped):** when this table is opened from a scanner variant whose baseline values are known (Build Registry → View KPIs), any cell whose value differs from the **mode** within the currently-loaded page is tinted amber. Computed client-side from the rows already fetched — no extra query. Falls back to no-tinting when called from contexts that don't supply a comparison baseline (Review Registry, Correct May KPIs).
- **Missing values** render as `—` muted.
- **Horizontal scroll** at the table container instead of width-blowing the panel (`overflow-x-auto`). Existing `max-h-72` vertical scroll preserved.
- **Sticky Employee column** on horizontal scroll so the row identity stays visible while scrolling right (`sticky left-0 bg-background z-10`).

### Optional toggle
A small "Show scale" toggle (default ON) lets admins collapse the scale columns when they only need workflow status. State is local to the component and remembered in `localStorage` under key `affectedKpisTable.showScale`.

---

## Technical details

### 1. `AffectedKpisTable.tsx`
- Extend the `select(...)` projection to include `frequency, criteria, uom, r0, r1, r2, r3, r4, r5`.
- Render seven new compact columns. Reuse the same `Cell`-style differs highlighting helper that `VariantScaleStrip` uses (extract a small pure helper `src/lib/scannerCellHighlight.ts` so both consumers share it — already covered by `VariantScaleStrip.test.tsx`).
- Compute per-column "mode" across the loaded page once per fetch:

  ```ts
  function modeValue(values: (string | null)[]): string | null {
    const counts = new Map<string, number>();
    for (const v of values) {
      const k = (v ?? '').trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    counts.forEach((n, v) => { if (n > bestN) { best = v; bestN = n; } });
    return best;
  }
  ```

  A cell is amber when its value is non-empty and differs from the column's mode AND the column has at least 2 distinct non-empty values across the page.
- Add `showScale` toggle (`Switch` from `@/components/ui/switch`) above the table, right-aligned next to the "Showing X of Y" counter.
- No change to the parent prop contract — extension is purely additive.

### 2. Shared helper — `src/lib/scannerCellHighlight.ts`
- `pageModes(rows, keys)` → `Record<key, string | null>` (mode per column across the page).
- `isOutlier(value, mode, columnHasVariety)` → boolean.
- Unit tests in `scannerCellHighlight.test.tsx` cover: all-equal column (no outliers), single outlier flagged, empty column (no flag), tie-mode (deterministic first-wins).

### 3. Memory
Append a "Drill-in table — Freq + R0–R5" section to `mem://features/admin/kpi-standardization-registry` describing the new columns, outlier rule, and `localStorage` key for the toggle.

---

## Risk & Impact
- **Data Impact:** Read-only — adds columns to an existing `select`. No schema or RPC change.
- **Workflow Impact:** None; purely informational.
- **UI/UX:** Drill-in panel widens horizontally; sticky Employee column + `overflow-x-auto` keep it usable inside the existing card. No layout regression for the parent group card (table is already inside a constrained container).
- **Regression Risk:** Very low. `AffectedKpisTable` is also used by Review Registry and Correct May KPIs — adding columns there is harmless and matches what admins already wanted in those flows too.
- **Mitigation:** New helper is unit-tested; `showScale` toggle lets admins hide the columns on small screens; no DB writes.
