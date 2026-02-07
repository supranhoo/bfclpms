
# Plan: User-Friendly Import with R-Column Based Qualitative Options

## Problem Summary

Currently, importing Tiered KPIs requires users to define `qualitativeOptions` as a complex JSON array:
```
[{"label":"Compliant","rating":5,"definition":"All audits passed"},{"label":"Partial","rating":3,"definition":"Minor issues"}]
```

This is error-prone and not user-friendly for non-technical users.

---

## Solution Overview

**Use the existing R5-R0 columns to define qualitative option labels!**

When `uomType = binary` or `uomType = tiered`:
1. Check if `qualitativeOptions` contains a trigger flag (`auto`, `true`, blank)
2. Scan R5, R4, R3, R2, R1, R0 columns for **text labels**
3. Auto-generate the `qualitative_options` array
4. **Only the defined options will appear in the frontend** (no hardcoded Yes/No)

---

## Excel Examples

### Example 1: Yes/No Binary (2 options only visible)

| uomType | R5  | R4 | R3 | R2 | R1 | R0 | qualitativeOptions |
|---------|-----|----|----|----|----|----|--------------------|
| binary  | Yes |    |    |    |    | No | auto               |

**Result:**
- `qualitative_options = [{label: "Yes", rating: 5}, {label: "No", rating: 0}]`
- Frontend shows only **Yes** and **No** buttons

### Example 2: Custom Binary Labels

| uomType | R5   | R4 | R3 | R2 | R1 | R0      | qualitativeOptions |
|---------|------|----|----|----|----|---------|-------------------|
| binary  | Done |    |    |    |    | Pending | auto              |

**Result:**
- `qualitative_options = [{label: "Done", rating: 5}, {label: "Pending", rating: 0}]`
- Frontend shows only **Done** and **Pending** buttons

### Example 3: 3-Tier Compliance

| uomType | R5        | R4 | R3      | R2 | R1 | R0            | qualitativeOptions |
|---------|-----------|----|---------|----|----|--------------|--------------------|
| tiered  | Compliant |    | Partial |    |    | Non-Compliant | auto               |

**Result:**
- `qualitative_options = [{label: "Compliant", rating: 5}, {label: "Partial", rating: 3}, {label: "Non-Compliant", rating: 0}]`
- Frontend shows only these **3 options**

### Example 4: 5-Level Risk Rating

| uomType | R5  | R4     | R3     | R2       | R1 | R0     | qualitativeOptions |
|---------|-----|--------|--------|----------|----|---------|--------------------|
| tiered  | Low | Medium | High   | Critical |    | Severe | auto               |

**Result:**
- `qualitative_options = [{label: "Low", rating: 5}, {label: "Medium", rating: 4}, {label: "High", rating: 3}, {label: "Critical", rating: 2}, {label: "Severe", rating: 0}]`
- Frontend shows only these **5 options**

---

## Logic Flow

```text
+--------------------------------------------------+
|          Parse Qualitative Options               |
+--------------------------------------------------+
              |
              v
  Is uomType = 'binary' or 'tiered'?
              |
     No ------+------> Skip qualitative processing
              |
             Yes
              |
              v
  qualitativeOptions = 'auto' | 'true' | empty?
              |
     No ------+------> Use existing JSON/template parsing
              |
             Yes
              |
              v
   +---------------------------------+
   |  Scan R5, R4, R3, R2, R1, R0    |
   |  for non-empty text labels     |
   +---------------------------------+
              |
              v
   Create qualitative_options array:
   - label = text from R column
   - rating = column number (5, 4, 3, 2, 1, 0)
   - definition = same as label (or use "|" syntax)
              |
              v
   Store in database
              |
              v
   Frontend renders ONLY these options
```

---

## Frontend Behavior Change

### Current Behavior (Binary)
- Uses hardcoded `BINARY_OPTIONS` constant: `[{label: "Yes", rating: 5}, {label: "No", rating: 0}]`
- Always shows "Yes" and "No" regardless of what was imported

### New Behavior (After Fix)
- For binary/tiered KPIs with `qualitative_options` stored in database, use those
- Only fallback to `BINARY_OPTIONS` if `qualitative_options` is null AND `uomType === 'binary'`
- This means imported options like "Done/Pending" will display correctly

---

## Extended Syntax (Optional)

For custom definitions, support `Label|Definition` format:

| R5 | R0 |
|----|----|
| Yes\|Task completed successfully | No\|Task not completed |

**Result:**
```json
[
  { "label": "Yes", "rating": 5, "definition": "Task completed successfully" },
  { "label": "No", "rating": 0, "definition": "Task not completed" }
]
```

---

## Technical Implementation

### Phase 1: Update Import Parsing Logic

**File: `src/pages/admin/ImportData.tsx`**

Add new `buildOptionsFromRColumns()` function:

```typescript
const buildOptionsFromRColumns = (row: KpiImportRow): QualitativeOption[] | undefined => {
  const rColumns: { key: keyof KpiImportRow; rating: number }[] = [
    { key: 'r5', rating: 5 },
    { key: 'r4', rating: 4 },
    { key: 'r3', rating: 3 },
    { key: 'r2', rating: 2 },
    { key: 'r1', rating: 1 },
    { key: 'r0', rating: 0 },
  ];

  const options: QualitativeOption[] = [];

  for (const { key, rating } of rColumns) {
    const value = row[key];
    if (!value || typeof value !== 'string' && typeof value !== 'number') continue;
    
    const strValue = String(value).trim();
    if (!strValue || !isNaN(Number(strValue))) continue; // Skip empty or numeric values
    
    // Check for extended syntax: "Label|Definition"
    if (strValue.includes('|')) {
      const [label, definition] = strValue.split('|').map(s => s.trim());
      if (label) {
        options.push({ label, rating, definition: definition || label });
      }
    } else {
      // Plain label - use label as definition
      options.push({ label: strValue, rating, definition: strValue });
    }
  }

  return options.length >= 2 ? options : undefined;
};
```

Update `parseQualitativeOptions()`:

```typescript
const parseQualitativeOptions = (value: any, row: KpiImportRow): QualitativeOption[] | undefined => {
  const uomType = String(row.uomType || 'numeric').toLowerCase();
  
  // 1. For binary/tiered, check for auto-build flag
  if (uomType === 'binary' || uomType === 'tiered') {
    const flagValue = String(value || '').toLowerCase().trim();
    if (!value || flagValue === 'auto' || flagValue === 'true' || flagValue === 'tiered' || flagValue === 'binary') {
      return buildOptionsFromRColumns(row);
    }
  }

  // 2. Check for template shorthand (e.g., "compliance_3")
  if (typeof value === 'string' && TIERED_TEMPLATES[value.trim()]) {
    return TIERED_TEMPLATES[value.trim()];
  }

  // 3. Existing JSON parsing
  if (typeof value === 'object' && Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }

  return undefined;
};
```

### Phase 2: Update Edge Function

**File: `supabase/functions/import-kpis/index.ts`**

Mirror the same logic server-side for background imports.

### Phase 3: Update Frontend Components

**Key Change:** When `qualitative_options` is stored in the database, use those instead of hardcoded `BINARY_OPTIONS`.

**Files to Update:**
- `src/components/review/QualitativeValueInput.tsx`
- `src/components/review/QualitativeSelect.tsx`
- `src/components/review/DailySubmissionGrid.tsx`
- `src/components/review/WeeklySubmissionTable.tsx`
- `src/components/review/DailySubmissionSummary.tsx`

**Example Change (QualitativeValueInput.tsx):**

```typescript
// BEFORE: Always uses BINARY_OPTIONS for binary type
const options = uomType === 'binary' ? BINARY_OPTIONS : qualitativeOptions || [];

// AFTER: Use qualitativeOptions if available, fallback to BINARY_OPTIONS only if null
const options = qualitativeOptions?.length 
  ? qualitativeOptions 
  : (uomType === 'binary' ? BINARY_OPTIONS : []);
```

### Phase 4: Update Template Download

Update the downloadable Excel template to include:
- Reference sheet showing R-column format for qualitative KPIs
- Examples for Yes/No, 3-tier, 5-tier configurations

---

## Validation Logic

Add helpful error messages:

```typescript
// In validation logic
if ((uomType === 'binary' || uomType === 'tiered') && !qualitativeOptions) {
  const rOptions = buildOptionsFromRColumns(row);
  if (!rOptions || rOptions.length < 2) {
    errors.push(
      `Row ${i}: ${uomType} KPI requires at least 2 options. ` +
      `Enter labels in R5-R0 columns (e.g., R5="Yes", R0="No") and set qualitativeOptions to "auto" or leave blank.`
    );
  }
}
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/admin/ImportData.tsx` | Modify | Add `buildOptionsFromRColumns()`, update `parseQualitativeOptions()` |
| `supabase/functions/import-kpis/index.ts` | Modify | Mirror R-column parsing logic for background imports |
| `src/components/review/QualitativeValueInput.tsx` | Modify | Use stored options if available |
| `src/components/review/QualitativeSelect.tsx` | Modify | Use stored options if available |
| `src/components/review/DailySubmissionGrid.tsx` | Modify | Use stored options if available |
| `src/components/review/WeeklySubmissionTable.tsx` | Modify | Use stored options if available |
| `src/components/review/DailySubmissionSummary.tsx` | Modify | Use stored options if available |
| `DOCUMENTATION.md` | Modify | Add section on simplified import syntax |

---

## Backward Compatibility

| Format | Status |
|--------|--------|
| Existing JSON arrays | Still works |
| Template shorthand (`compliance_3`) | Still works |
| New R-column + `auto` flag | New feature |
| New `Label\|Definition` extended syntax | New feature |
| Existing binary KPIs without options | Still use default Yes/No |

---

## Testing Checklist

- [ ] Yes/No binary import shows only "Yes" and "No" buttons
- [ ] Custom binary labels (Done/Pending) display correctly
- [ ] 3-tier compliance shows only defined options
- [ ] Empty R columns are skipped correctly
- [ ] Extended `Label|Definition` syntax works
- [ ] Template shorthand still works (`compliance_3`)
- [ ] JSON format still works (backward compatibility)
- [ ] Background import handles all new formats
- [ ] Existing binary KPIs (without stored options) still work
