

# Plan: UOM Dropdown List Implementation

## Summary

Convert the Unit of Measure (UOM) field from a free-text input to a dropdown list with predefined options across all KPI creation and editing interfaces.

## Proposed UOM Options

Based on existing database values and common PMS requirements:

| UOM Value | Description | Example Usage |
|-----------|-------------|---------------|
| `%` | Percentage | Revenue growth, completion rate |
| `Number` | Count/Quantity | Tasks completed, calls made |
| `Days` | Duration in days | Turnaround time, SLA compliance |
| `Hours` | Duration in hours | Response time, training hours |
| `Minutes` | Duration in minutes | Call handling time |
| `Amount` | Currency value | Sales revenue, cost savings |
| `Date` | Specific date | Project deadline, submission date |
| `Index` | Index/Score value | NPS score, satisfaction index |
| `Ratio` | Ratio between values | Conversion ratio, efficiency ratio |
| `Score` | Rating or score | Quality score, audit score |
| `Count` | Similar to Number (alternative label) | Incidents, defects |
| `Rate` | Rate per unit | Error rate, attrition rate |

## Files to Modify

| File | Location | Change |
|------|----------|--------|
| `src/lib/uomConstants.ts` | New file | Define UOM_OPTIONS constant array |
| `src/components/admin/AdminKpiCreateDialog.tsx` | Lines 249-255 | Replace Input with Select dropdown |
| `src/components/admin/AdminKpiEditDialog.tsx` | Lines 234-239 | Replace Input with Select dropdown |
| `src/components/admin/TemplateFormDialog.tsx` | Lines 264-270 | Replace Input with Select dropdown |
| `src/lib/importValidation.ts` | Line 39 | Update schema to validate against allowed UOMs |
| `DOCUMENTATION.md` | UOM section | Document valid UOM options |

## Technical Implementation

### 1. New Constants File: `src/lib/uomConstants.ts`

```typescript
export const UOM_OPTIONS = [
  { value: '%', label: 'Percentage (%)' },
  { value: 'Number', label: 'Number' },
  { value: 'Days', label: 'Days' },
  { value: 'Hours', label: 'Hours' },
  { value: 'Minutes', label: 'Minutes' },
  { value: 'Amount', label: 'Amount (₹)' },
  { value: 'Date', label: 'Date' },
  { value: 'Index', label: 'Index' },
  { value: 'Ratio', label: 'Ratio' },
  { value: 'Score', label: 'Score' },
  { value: 'Count', label: 'Count' },
  { value: 'Rate', label: 'Rate' },
] as const;

export type UomValue = typeof UOM_OPTIONS[number]['value'];
```

### 2. UI Change Pattern

Replace current Input:
```tsx
// BEFORE
<Input
  value={formData.uom}
  onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
  placeholder="%"
/>

// AFTER
<Select
  value={formData.uom}
  onValueChange={(val) => setFormData({ ...formData, uom: val })}
>
  <SelectTrigger>
    <SelectValue placeholder="Select UOM" />
  </SelectTrigger>
  <SelectContent>
    {UOM_OPTIONS.map((uom) => (
      <SelectItem key={uom.value} value={uom.value}>
        {uom.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 3. Import Validation Update

```typescript
// src/lib/importValidation.ts line 39
uom: z.enum(['%', 'Number', 'Days', 'Hours', 'Minutes', 'Amount', 'Date', 'Index', 'Ratio', 'Score', 'Count', 'Rate'])
  .optional()
  .or(z.string().max(50).optional()), // Allow custom for backward compatibility
```

## Backward Compatibility

- Existing KPIs with custom UOM values (like "Nos") will continue to work
- The dropdown will show the stored value even if it's not in the predefined list
- Import validation will warn but not reject non-standard UOMs

## Visual Preview

```text
┌────────────────────────────────────┐
│ Unit of Measure (UOM)              │
├────────────────────────────────────┤
│ [Select UOM                      ▼]│
├────────────────────────────────────┤
│  ✓ Percentage (%)                  │
│    Number                          │
│    Days                            │
│    Hours                           │
│    Minutes                         │
│    Amount (₹)                      │
│    Date                            │
│    Index                           │
│    Ratio                           │
│    Score                           │
│    Count                           │
│    Rate                            │
└────────────────────────────────────┘
```

