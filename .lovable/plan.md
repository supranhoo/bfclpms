

## Enlarge Copy KRAs Dialog to Full-Width Two-Panel Layout

### Problem
The dialog is `max-w-2xl` (672px) — too cramped for a 3-step workflow involving source selection, KRA picking, and multi-employee targeting. Lists are capped at `max-h-48` (192px), forcing excessive scrolling.

### Fix — 1 file: `src/components/admin/CopyKrasDialog.tsx`

1. **Widen dialog**: Change `max-w-2xl` → `max-w-5xl` (1024px) at line 285
2. **Increase height**: Change `max-h-[85vh]` → `max-h-[90vh]`
3. **Expand KRA list**: Change `max-h-48` → `max-h-64` (line 371) for the source KPI list
4. **Expand target employee list**: Change `max-h-48` → `max-h-64` (line 420) for the target employee list
5. **Two-column layout for Steps 1+3**: Wrap source employee selector (Step 1) and target employee selector (Step 3) side-by-side using `grid grid-cols-1 lg:grid-cols-2 gap-6` so users can see source and target simultaneously
6. **KRA selection spans full width** between the two columns (Step 2)

This matches the existing `max-w-5xl` pattern used by AdminKpiEditorForm.

