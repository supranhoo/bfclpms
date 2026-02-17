

# Inline Weightage Editing + Scroll-to-Top in KRA Issuance Dialog

## Overview

Two enhancements to the "Issue KRAs -- Confirmation" dialog:

1. **Editable Weightage** -- Replace static weightage badges with inline number inputs so admins can adjust weightages on-the-fly to reach 100%.
2. **Scroll to Top** -- After the admin clicks "Confirm & Issue" and the dialog closes, the All KPIs page automatically scrolls back to the top for a clean return to the employee list.

---

## Before

- Weightage column shows read-only badges (e.g., `15%`). To fix weightage, the admin must close the dialog, edit each KPI individually, then reopen.
- After issuing, the page stays at whatever scroll position the admin was at (potentially deep in an expanded employee row).

## Changes

### 1. `KraIssuanceConfirmDialog.tsx` -- Inline Weightage Editing

- Add `weightageOverrides` state: `Record<string, number>` keyed by KPI id
- Replace the static `<Badge>` in the Weightage column with a compact `<Input type="number" />` (w-16, centered)
- Recalculate `totalWeightage` using overrides: `overrides[id] ?? original`
- Show a small blue dot next to modified values
- On "Confirm & Issue":
  - Batch-update any KPIs whose weightage was changed
  - Then mark all as `is_issued = true`
  - Then send notification with the updated weightage values

### 2. `AllKpis.tsx` -- Scroll to Top on Dialog Close

- Add a callback `onIssuanceComplete` passed to the dialog
- In the callback (or in the dialog's `onClose` after success), call `window.scrollTo({ top: 0, behavior: 'smooth' })` to scroll the page back to the top

### 3. `DOCUMENTATION.md`

- Document inline weightage editing and scroll-to-top behavior

## After

- The Weightage column in the confirmation dialog shows editable number inputs. As the admin types, the Total Weightage card updates in real-time (green at 100%, amber/red otherwise). Modified fields show a blue dot indicator.
- After confirming issuance, the page smoothly scrolls to the top of the All KPIs list.

---

## Technical Detail

### Weightage Override State

```typescript
const [weightageOverrides, setWeightageOverrides] = useState<Record<string, number>>({});

const getEffectiveWeightage = (kpi) => weightageOverrides[kpi.id] ?? kpi.weightage ?? 0;

const totalWeightage = kpis?.reduce((sum, k) => sum + getEffectiveWeightage(k), 0) || 0;
```

### Mutation Update (changed KPIs only)

```typescript
// Save changed weightages
const changed = Object.entries(weightageOverrides);
for (const [id, newVal] of changed) {
  await supabase.from('kpis').update({ weightage: newVal }).eq('id', id);
}
// Then mark all as issued
await supabase.from('kpis').update({ is_issued: true }).in('id', kpiIds);
```

### Scroll to Top

```typescript
// In AllKpis.tsx, after dialog closes on success:
const handleIssuanceComplete = () => {
  setIssuanceDialogOpen(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
```

### Files to Change

| File | Change |
|---|---|
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | Add weightage override state, editable inputs, batch-save logic |
| `src/pages/admin/AllKpis.tsx` | Add scroll-to-top on issuance dialog close |
| `DOCUMENTATION.md` | Document inline editing and scroll behavior |

