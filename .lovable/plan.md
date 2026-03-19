

## Add Weightage Include/Exclude Option to Template Propagation

### Problem
When an admin edits a template in the KRA Library and propagates changes, `weightage` is always included as a structural field. This overwrites individual employee weightages that were customized via the Weightage Dashboard.

### Solution
Add a checkbox in the propagation section of the TemplateFormDialog that lets the admin choose whether to include or exclude weightage from propagation. Default: **excluded** (since weightage is typically customized per employee).

### Files to Change

| File | Change |
|------|--------|
| `src/components/admin/TemplateFormDialog.tsx` | Add `includeWeightage` state (default `false`). When building `changedFields` for propagation, filter out `weightage` unless the checkbox is checked. Show checkbox UI in the propagation options section. |
| `supabase/functions/propagate-template-change/index.ts` | No change needed — the edge function already only processes fields present in `fields_changed`, so excluding `weightage` from the client payload is sufficient. |

### UI Detail
In the propagation options area (near the "Propagate to linked KPIs" toggle), add:

```
☐ Include weightage changes
  ⚠ Caution: This will overwrite individual employee weightages
```

The checkbox is only visible when weightage was actually changed in the form. When unchecked (default), `weightage` is removed from `changedFields` before sending to the edge function.

### Edge Case
If weightage is the **only** field changed and the checkbox is unchecked, the propagation section shows a note: "No fields selected for propagation" and disables the propagate button.

---

# Weightage Propagation Guard — IMPLEMENTED ✅

## Problem
When propagating template changes from KRA Library, `weightage` was always included as a structural field, overwriting individual employee weightages customized via the Weightage Dashboard.

## Fix
Added an **"Include weightage changes"** checkbox (default: unchecked) in the propagation section of `TemplateFormDialog`. When unchecked, `weightage` is filtered out of the `fields_changed` payload sent to the edge function.

| Detail | Behavior |
|--------|----------|
| Default | Weightage **excluded** from propagation |
| Checkbox visible | Only when weightage was actually changed in the form |
| Warning | ⚠ "Caution: This will overwrite individual employee weightages" |
| Edge case | If weightage is the only change and checkbox is unchecked, propagation shows "No fields selected" and disables Preview/Propagate |
| Edge function | No change needed — already filters by `fields_changed` keys |

### File Changed
| File | Change |
|------|--------|
| `TemplateFormDialog.tsx` | Added `includeWeightage` state, `propagationChangedFields` memo, checkbox UI with warning, disabled states when no propagable fields |

