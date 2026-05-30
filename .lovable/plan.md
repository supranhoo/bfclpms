## Problem

At 100% browser zoom on a typical laptop viewport (~929×574 CSS px), the **Add New User** dialog clips the Organization section — only the section header is visible, fields and the rest are hidden behind the footer. The user must zoom to 67% to see everything. The dialog already uses `max-h-[92vh]` + `ScrollArea`, but the inner content is taller than the available area and the scroll affordance is not obvious, so it reads as "missing content."

## Goal

All fields of the Profile tab should be visible **without scrolling and without zooming out** on standard laptop viewports, while keeping the existing fields, validation, and submit logic untouched.

## Approach (UI only — no logic changes)

Compact the Profile tab layout in `src/pages/admin/UserManagement.tsx` (Create dialog, lines ~1442–end of Profile tab, and mirror in Edit dialog for parity):

1. **Tighter vertical rhythm**
   - `space-y-6` → `space-y-4` on tab content
   - `space-y-4` → `space-y-3` inside each section
   - `space-y-2` → `space-y-1.5` on each field (Label + Input)
   - Reduce `mt-4` on ScrollArea to `mt-3`; remove `py-1`
   - Inputs: add `h-9` (default is h-10) for slightly shorter rows

2. **Denser grid**
   - Personal Information: change `md:grid-cols-2` → `md:grid-cols-3` so Full Name / Email / Employee Code sit on row 1 and GDOJ / DOJ on row 2 (2 rows instead of 3).
   - Organization: keep `md:grid-cols-2` but reduce `gap-4` → `gap-3`.

3. **Lighter section headers**
   - Drop the `Separator` under each section header (header + uppercase label already provides separation).
   - Section header wrapper: remove `space-y-4` wrapper's extra gap; use `mb-2` on header.

4. **Dialog sizing safeguard**
   - Keep `max-h-[92vh]` and `ScrollArea` (so very small viewports still scroll gracefully), but the content will now fit at ~574px viewport height without scrolling.

No changes to:
- Field set, labels, placeholders, required markers
- State variables, mutations, payload shape
- Access tab, Edit dialog field logic
- Database, edge functions, validation

## Files touched

- `src/pages/admin/UserManagement.tsx` — Create dialog Profile tab markup; mirror spacing tweaks in Edit dialog for visual parity.

## Risk & Impact

- **Data / Workflow / Regression:** None — purely Tailwind class adjustments on the Create/Edit dialogs.
- **UI/UX:** Slightly denser form; still aligned with existing shadcn input/label scale. No responsive breakage — single-column on mobile is preserved (`grid-cols-1 md:grid-cols-3`).
- **Mitigation:** Manual visual check at 929×574 and at mobile width after build.

## Verification

- Open Add New User at default zoom on a ~930×580 viewport → all Personal Information + Organization fields and footer visible without scrolling.
- Mobile viewport: fields stack single-column as before.
- Edit User dialog reflects the same compact spacing.

## Docs

- `DOCUMENTATION.md` — note the Add/Edit User dialog density adjustment under User Management UI.
- `POLICY.md` — Not Applicable (no policy change).
