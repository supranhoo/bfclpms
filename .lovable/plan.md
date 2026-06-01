## Plan: Improve Employee Master Fields Layout

### Goal
Convert the Employee Master Fields section from a single-column table layout to a responsive 3/2/1 column card grid to reduce vertical space usage.

### Changes

#### File: `src/components/admin/EmployeeMasterFieldsCard.tsx`
- Replace the current `rounded-md border divide-y` table-like container with a responsive CSS grid:
  - `grid-cols-1` (mobile)
  - `md:grid-cols-2` (tablet)
  - `lg:grid-cols-3` (desktop)
- Replace each row `<div>` with a compact card-like item containing:
  - Field name (`Label`)
  - "Required by system" helper text (if `alwaysRequired`)
  - `Switch` toggle, right-aligned
- Remove the header row ("Field / Mandatory") since each card is self-explanatory.
- Keep `Switch` `checked`, `disabled`, `onCheckedChange`, and `aria-label` behavior exactly as-is.
- Keep the `handleToggle` logic unchanged.
- Keep `isLoading` and `update.isPending` disabled states.

### Visual Style
- Use existing PMS design tokens: `border`, `rounded-lg`, `p-4`, `bg-card` or `bg-muted/20`.
- Keep spacing consistent with existing cards (`gap-4`).
- No table headers, borders between rows, or full-width separator lines.

### Acceptance Criteria
- Desktop (≥1024px): 3 field cards per row.
- Tablet (≥768px): 2 field cards per row.
- Mobile (<768px): 1 field card per row.
- Full Name and Employee Code toggles remain checked and disabled.
- All other toggles remain interactive.
- Saving updates persists correctly.
- Add New User `RequiredMark` behavior is unaffected (no changes to hooks/lib/pages).