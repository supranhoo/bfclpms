# Move TNI Threshold Control onto the TNI Report

## Assumptions
- The control governs the two ADR-252 continuity parameters already exposed by `TniThresholdCard`: TNI threshold (0–5) and consecutive/minimum scored months (1–24).
- Only Admins may change them; everyone else sees the current values read-only.
- Admin → System Settings no longer hosts this card (single source of control).

## What changes visually
On **Reports → TNI Report**, directly **below the month/period filter bar** and **above the continuity-rule alert**, a compact settings strip appears:
- Read-only for non-admins: `Threshold 3.00 · minimum 3 scored month(s)` with a short explanation line.
- For admins: the same strip plus two inline numeric inputs and a **Save** button (disabled until changed, toast on save).
- Collapsible on mobile (title row + chevron) so it does not push the KPI cards down on small screens.
- The existing continuity-rule alert stays, and continues to read the live threshold.

Removed from **Admin → System Settings**: the "TNI Threshold & Continuity Window" card, replaced by a one-line pointer to the TNI Report.

## Technical approach
1. Refactor `src/components/admin/TniThresholdCard.tsx` into a reusable
   `src/components/reports/TniThresholdInline.tsx`:
   - same query/mutation logic (`getTniThreshold` / `setTniThreshold`, `pip_consecutive_months` upsert),
   - new `readOnly` prop; inputs and Save render only when the caller passes admin.
   - keeps invalidation of `['tni-threshold']`, `['pip-policy-settings']`, `['tni-qualified-kpis']` so the report re-qualifies immediately after a save.
2. `src/pages/reports/TNIReport.tsx`: render `<TniThresholdInline readOnly={!isAdmin} />` after the period filter block, before the ADR-252 alert. Admin check via the existing role hook used elsewhere in the page (`useUserRole` / `hasRole('admin')`).
3. `src/pages/admin/SystemSettings.tsx`: remove the `TniThresholdCard` import and usage; delete the old component file.
4. Write path is unchanged — `system_settings` upsert, already admin-restricted by RLS; the UI gate is cosmetic on top of that.

## Risk & impact
- Data: none. No schema change; same two `system_settings` keys.
- Workflow: threshold edits now happen from the report; RLS still the real guard, so a non-admin cannot write even if the UI were bypassed.
- Regression: PIP surfaces read the same settings and stay correct because query keys are invalidated identically.
- Rollback: re-add the card to System Settings; no data migration needed.

## Tests & docs
- Extend `src/test/tni/continuityRule.test.ts` (or a new small test) to assert the inline component renders read-only without admin and exposes inputs with admin.
- Update `DOCUMENTATION.md` and `POLICY.md` §PMS-CONTINUITY-AT-OR-BELOW with the new location of the control (ADR-252a).
