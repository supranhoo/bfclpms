
# Add UOM Type Selector to Admin KPI Editor

## Overview
Add the ability to change the "UOM Type" (Numeric, Binary, or Tiered) when editing a KPI in the Admin KPI Editor dialog. This will allow admins to modify how achieved values are captured and scored for each KPI.

## Current State
- The `AdminKpiEditDialog` component allows editing most KPI fields but does NOT include `uom_type` or `qualitative_options`
- The `UomTypeSelector` component already exists and provides a clean UI for selecting between Numeric, Binary, and Tiered types
- The `TieredOptionsBuilder` component exists for configuring custom tiered options
- The KPI database table already has `uom_type` and `qualitative_options` columns

## Changes Required

### 1. Update Form State in AdminKpiEditDialog.tsx
Add `uom_type` and `qualitative_options` fields to the form state:
```typescript
const [formData, setFormData] = useState({
  // ... existing fields
  uom_type: 'numeric' as 'numeric' | 'binary' | 'tiered',
  qualitative_options: [] as QualitativeOption[],
});
```

### 2. Add UOM Type Selector UI
Import and add the `UomTypeSelector` component between the "Source of Data" field and the "Organization-Level KPI Toggle" section:
- Show the selector with three options: Numeric, Binary, Tiered
- When "Tiered" is selected, display the `TieredOptionsBuilder` below it

### 3. Conditional Field Display
- When UOM Type is "Numeric": Show Target Value and Rating Thresholds (r5-r0) as normal
- When UOM Type is "Binary": Hide Target Value and Rating Thresholds (automatically uses Yes=5, No=0)
- When UOM Type is "Tiered": Hide Target Value and Rating Thresholds, show `TieredOptionsBuilder` instead

### 4. Update Form Submission
Include `uom_type` and `qualitative_options` in the update payload:
```typescript
await updateKpi.mutateAsync({
  // ... existing fields
  uom_type: formData.uom_type,
  qualitative_options: formData.uom_type === 'tiered' ? formData.qualitative_options : null,
});
```

### 5. Populate Form on Load
Update the `useEffect` to load existing UOM type and qualitative options from the KPI:
```typescript
uom_type: kpi.uom_type || 'numeric',
qualitative_options: kpi.qualitative_options || [],
```

## Technical Details

### Files to Modify
- `src/components/admin/AdminKpiEditDialog.tsx`

### New Imports Required
```typescript
import { UomTypeSelector } from '@/components/admin/UomTypeSelector';
import { TieredOptionsBuilder } from '@/components/admin/TieredOptionsBuilder';
import { UomType, QualitativeOption } from '@/lib/qualitativeUom';
```

### UI Layout
```text
+----------------------------------+
| ... existing fields ...          |
+----------------------------------+
| UOM Type                         |
| [Numeric] [Binary] [Tiered]      |
+----------------------------------+
| (If Tiered selected)             |
| Tiered Options Builder           |
| - Option 1: Label, Rating, Def   |
| - Option 2: ...                  |
| [+ Add Option]                   |
+----------------------------------+
| (If Numeric selected)            |
| Rating Thresholds (r5-r0)        |
+----------------------------------+
| ... rest of fields ...           |
+----------------------------------+
```

### Validation
- For Tiered type: Ensure at least 2 options are defined before saving
- Use existing `validateQualitativeOptions` function from `qualitativeUom.ts`
