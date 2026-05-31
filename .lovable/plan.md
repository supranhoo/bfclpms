# Increment Slabs — Premium Full-Width Redesign

Scope: **UI/presentation only** for `src/pages/increment/IncrementSlabs.tsx` and a thin width tweak to the System Settings shell so the Increment section can breathe edge-to-edge. **No changes to hooks, services, RPCs, RLS, slab matcher, editor dialog logic, validations, or permissions.**

## Risk & Impact Report
- **Data Impact:** None. No schema/RLS/query change.
- **Workflow Impact:** None. All actions (AY select, Copy Previous Year, Add Slab, View/Edit, Delete, confirm dialog) preserved 1:1.
- **UI/UX Impact:** Increment Slabs page restyled; new Scope drawer (read-only). Other System Settings sections untouched.
- **Regression Risk:** Low — `SlabEditorDialog`, `useIncrementSlabs`, `useDeleteSlab`, `useCopyPreviousYearSlabs`, `ConfirmDestructiveDialog`, `describeScope`, `slabSpecificity` all reused as-is.
- **Mitigation:** Keep component contracts identical; add a snapshot/structural test for the new page; manually verify add/edit/delete/copy flows still trigger the same mutations.

## What changes visually

### 1. Full-width section shell (single targeted tweak)
- In `SystemSettings.tsx` `renderSectionContent` wrapper for the **Increment** case only, drop the inner max-width constraint so the table uses the full right-pane width on ≥1366px, ≥1440px, ≥1920px. Sidebar + tab strip layout untouched.

### 2. New page structure for `IncrementSlabs.tsx`
```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Sticky Page Header                                                        │
│  ┌─ Title block ──────────────────┐    ┌─ Action cluster ──────────────┐  │
│  │ Increment Slabs                │    │ [AY 2025-26 ▾] [Copy Prev]    │  │
│  │ Rating bands & increment %…    │    │ [+ Add Slab] (primary)        │  │
│  └────────────────────────────────┘    └───────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────────────┤
│ Stat strip (read-only chips from existing data):                          │
│  Total Slabs · Avg Increment % · Fully-scoped (6/6) · Org-wide (0/6)      │
├───────────────────────────────────────────────────────────────────────────┤
│ Card · full width · soft shadow · rounded-xl                              │
│  ┌─ Sticky table header ───────────────────────────────────────────────┐ │
│  │ Rating Band │ Increment │ Scope (compact)        │ Specificity │ ⋯  │ │
│  ├─────────────┼───────────┼────────────────────────┼─────────────┼────┤ │
│  │ 4.50→5.00   │ 20.00%    │ 2 Co · 6 Div · +3 more │  ●●●●●● 6/6 │ ⋯  │ │
│  │  (zebra + hover:bg-muted/40, row h-14)                              │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

### 3. Table improvements (presentation only)
- **Sticky** `thead` with `bg-card/95 backdrop-blur` and subtle bottom border.
- Zebra rows via `even:bg-muted/20`, `hover:bg-muted/40 transition-colors`.
- **Rating Band** rendered as two pills `4.50 → 5.00` in tabular-nums, monospace.
- **Increment** as bold large number + small muted "pro-rata on DOJ" caption.
- **Scope (compact):** instead of raw `describeScope()` string, show up to 2 dimension chips + `+N more`, plus a `View Scope` link that opens the drawer.
- **Specificity:** keep `slabSpecificity()` value, render as 6-dot meter + `n/6` label, color-graded via semantic tokens (`bg-primary` for filled, `bg-muted` for empty). No business meaning change.
- **Actions:** icon buttons with `Tooltip` ("View / Edit", "Delete") — still call existing `openEdit(s)` and `setConfirmDelete(s.id)`.
- Empty state: centered illustration block + "No slabs defined…" + primary "Add Slab" CTA (calls existing `openCreate`).
- Loading: replace bare spinner with 5 skeleton rows.

### 4. New: `SlabScopeDrawer` (read-only)
- New file `src/components/increment/SlabScopeDrawer.tsx`.
- Uses existing `Sheet` (Radix) on the right, ~480px.
- Reads the same `masters` map already passed to the page and walks `SLAB_DIMENSIONS` to render each dimension as a section:
  - Company · Division · Business Unit · Location · Employee Category · Level
  - Each section: header + chip list of resolved names; "All <dimension>" placeholder when the array is empty.
- Read-only; "Edit Slab" footer button opens the existing `SlabEditorDialog` via the page's `openEdit`.

### 5. Design tokens (semantic, in `index.css`)
- **No raw hex in components.** Tune the existing HSL tokens so the section reads as deep corporate blue / slate / emerald / soft red on `#F8FAFC`-equivalent background:
  - `--primary` → deep corporate blue
  - `--success` → emerald (add if missing)
  - `--destructive` → soft red (keep)
  - `--muted` / `--card` / `--background` retuned for the lighter neutral surface.
- All component classes consume tokens (`bg-card`, `text-primary`, `bg-success/10 text-success`, etc.). Other pages inherit refinements transparently; no per-screen hardcoding.

### 6. Responsiveness
- ≥1280px: full table.
- 768–1279px: same table, horizontal scroll inside the card (sticky first column = Rating Band).
- <768px: card list fallback — each slab as a stacked card with the same fields and action buttons.

### 7. Accessibility
- Focus rings on all interactive elements (`focus-visible:ring-2 ring-ring`).
- Action icons keep `aria-label` + `Tooltip`.
- Sticky header announced as `<th scope="col">`.
- Contrast checked against tokens (≥4.5:1 for body, ≥3:1 for large/badge text).
- Keyboard: Tab order Header → AY → Copy → Add → row actions; `Esc` closes drawer & dialogs (Radix default).

## Files

**Edited (presentation only)**
- `src/pages/increment/IncrementSlabs.tsx` — full rewrite of JSX/layout, same hooks/handlers/props.
- `src/pages/admin/SystemSettings.tsx` — Increment-case wrapper width tweak only.
- `src/index.css` — token retune (primary / success / surface) using HSL.

**New**
- `src/components/increment/SlabScopeDrawer.tsx` — read-only Sheet.
- `src/test/incrementSlabsPage.test.tsx` — render test: header actions wired to existing mutations, scope drawer opens, delete confirm still uses `ConfirmDestructiveDialog`, no calls into Supabase paths beyond the existing hooks.

**Untouched (explicitly)**
- `src/components/increment/SlabEditorDialog.tsx`
- `src/hooks/useIncrementSlabs.ts`, `useIncrementEligibility.ts`
- `src/lib/slabMatcher.ts`, `src/lib/slabDimensions.ts`
- All migrations, RPCs, RLS, edge functions.

## Verification steps
1. AY dropdown changes year → list refetches (existing `useIncrementSlabs(year)`).
2. Copy Previous Year → existing mutation fires; success toast unchanged.
3. Add Slab → `SlabEditorDialog` opens in create mode.
4. View / Edit → same dialog in edit mode, pre-filled.
5. Delete → `ConfirmDestructiveDialog` → existing `del.mutate`.
6. View Scope → new drawer renders all 6 dimensions with resolved master names; empty arrays show "All <dimension>".
7. Resize 1920 / 1440 / 1366 / 1024 / 768 / 375 — no horizontal page scroll; table card grows to fill width.
8. Run new test + existing slab tests.

## Docs & Policy
- **DOCUMENTATION.md:** add "Increment Slabs — UI v2" note under Admin → Increment (layout, scope drawer, token retune). No API/schema section changes.
- **POLICY.md:** **Not Applicable** — no business rule changed (slab matching, specificity tie-break, prorate flag, AY scoping all unchanged).
- Version history entry: `vX.Y — Increment Slabs page redesigned (UI only); no policy/logic change.`

## Rollback
Single-commit revert restores the previous page; no DB or config changes to undo.
