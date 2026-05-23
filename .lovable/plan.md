### Goal
Make the "Workflow mapping" card in **User Management → Edit User → Access & Login** show the user's currently **Assigned Workflow** and let admins change it inline — no navigation to `/admin/workflow-config` required.

### Behavior
- Card displays:
  - Title: **Workflow mapping**
  - Inline `<Select>` labeled **Assigned Workflow** populated from `useWorkflowTemplates(true)` (active templates only).
  - Current value comes from `useWorkflowConfigs()` filtered to `scope_type='employee'`, `scope_id=selectedUser.id`, `review_period=null` (global override).
  - Placeholder when none set: *"Inherit (default)"*.
  - Small caption below select showing the resolved template's stages via existing `WorkflowStagesPreview` (reused/imported) — read-only.
- Actions:
  - Changing the select calls `useUpsertWorkflowConfig` with `{ scope_type:'employee', scope_id:selectedUser.id, workflow_template_id:<new>, review_period:null, review_year:null }`.
  - A small **"Reset to default"** ghost button appears only when an override exists, calling `useDeleteWorkflowConfig` on the existing config row.
  - Success/error toasts via existing `useToast`.
- The card no longer navigates away; closes nothing. Other 3 cards in the grid are unchanged.

### UI changes
- File: `src/pages/admin/UserManagement.tsx`, the 4th card at lines ~1256–1264.
- Card grows taller than siblings — wrap the inline control area inside the same `rounded-lg border p-4` shell but replace the `<button>` with a `<div>` (no whole-card click target). The other 3 cards remain buttons.
- Grid stays `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`. On `lg` the taller card aligns top; siblings keep their height. Acceptable visual.
- Stages preview wraps; uses `flex-wrap` so it fits the narrow card column.

### Out of scope
- `/admin/workflow-config` page is unchanged and still reachable from the sidebar.
- No period-specific (monthly) overrides from this card — only the global employee override, matching the most common admin intent. Period-specific tuning stays on the dedicated page.
- No new RPCs, schema changes, or RLS changes.
- No changes to other 3 cards.

### Technical notes
- Reuse existing hooks: `useWorkflowTemplates`, `useWorkflowConfigs`, `useUpsertWorkflowConfig`, `useDeleteWorkflowConfig` from `@/hooks/useWorkflowConfig` — already query-cached, so opening the dialog is cheap.
- Extract `WorkflowStagesPreview` into a shared spot OR inline a tiny local version (5 lines). I'll inline locally to avoid touching `WorkflowConfig.tsx`.
- Loading state: show a muted "Loading…" inside the select trigger until templates/configs resolve.

### Risk & Impact
- **Data:** Writes to existing `workflow_configs` table via existing hook. No schema impact.
- **Workflow:** Same upsert path admins already use on the dedicated page — identical effect.
- **UI/UX:** One card becomes taller; siblings unaffected on `lg`. On `md` the 2×2 layout naturally absorbs height.
- **Regression:** Low. Hooks already battle-tested by `/admin/workflow-config`.
- **Mitigation:** Manual QA — open Edit User on an employee with no override (shows "Inherit (default)"), assign a template, verify reflection on `/admin/workflow-config`, then reset.

### Rollback
Revert the 4th card to the prior navigation-only button.
