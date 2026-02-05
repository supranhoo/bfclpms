

# Plan: Enhance Review Journey with Submitted Values & Numeric Ratings

## Overview

Two changes are needed for the "Review Journey" section in "View KPI Details":

1. **Show submitted/achieved values** at each level (Self, Manager, Auditor, Management)
2. **Display only numeric ratings** (5, 4, 3, 2, 1, 0) without descriptive labels like "Outstanding"

---

## Current State

### ReviewStageCard Display (Line 86-91)
```tsx
<Badge style={{ backgroundColor: getRatingColor(rating) }}>
  {score} - {getRatingLabel(rating)}  // Shows "4 - Outstanding"
</Badge>
```

### Missing Data
- `ReviewSubmission` interface lacks `manager_achieved_value`, `auditor_achieved_value`, `management_achieved_value`
- `ReviewStageCard` doesn't receive or display achieved values

---

## Solution

### Change 1: Update ReviewSubmission Interface

**File**: `src/hooks/useKpis.ts`

Add the missing achieved value fields:

```typescript
export interface ReviewSubmission {
  // ... existing fields ...
  achieved_value: number | null;           // Self's value
  manager_achieved_value: number | null;   // NEW
  auditor_achieved_value: number | null;   // NEW
  management_achieved_value: number | null; // NEW
  // ... rest of fields ...
}
```

### Change 2: Update KpiJourneySection

**File**: `src/components/review/KpiJourneySection.tsx`

Pass achieved values to each stage:

```typescript
const stageData = {
  self: {
    // ... existing ...
    achievedValue: submission?.achieved_value ?? null,  // NEW
  },
  manager: {
    // ... existing ...
    achievedValue: (submission as any)?.manager_achieved_value ?? null,  // NEW
  },
  auditor: {
    // ... existing ...
    achievedValue: (submission as any)?.auditor_achieved_value ?? null,  // NEW
  },
  management: {
    // ... existing ...
    achievedValue: (submission as any)?.management_achieved_value ?? null,  // NEW
  },
};

// In the render:
<ReviewStageCard
  // ... existing props ...
  achievedValue={data.achievedValue}  // NEW
/>
```

### Change 3: Update ReviewStageCard

**File**: `src/components/review/ReviewStageCard.tsx`

1. Add `achievedValue` prop
2. Display achieved value prominently
3. Show only numeric rating (remove description)

```typescript
interface ReviewStageCardProps {
  // ... existing props ...
  achievedValue: number | null;  // NEW
}

// In the Score section:
{/* Achieved Value */}
{achievedValue !== null && (
  <div className="text-xs text-muted-foreground mb-1">
    Value: <span className="font-medium text-foreground">{achievedValue}</span>
  </div>
)}

{/* Rating Badge - NUMERIC ONLY */}
{score !== null ? (
  <Badge 
    style={{ backgroundColor: getRatingColor(rating) }} 
    className="text-white text-xs"
  >
    Rating: {score}  // Changed from "{score} - {getRatingLabel(rating)}"
  </Badge>
) : ...}
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/hooks/useKpis.ts` | Add `manager_achieved_value`, `auditor_achieved_value`, `management_achieved_value` to `ReviewSubmission` interface |
| `src/components/review/KpiJourneySection.tsx` | Pass `achievedValue` for each stage to `ReviewStageCard` |
| `src/components/review/ReviewStageCard.tsx` | Add `achievedValue` prop, display value, show only numeric rating |
| `DOCUMENTATION.md` | Update Review Journey documentation |

---

## Visual Comparison

### Before
```
┌─────────────────┐
│  Self           │
│  [4 - Outstanding] │
│  No remarks     │
└─────────────────┘
```

### After
```
┌─────────────────┐
│  Self           │
│  Value: 95      │  ← NEW: Shows submitted value
│  [Rating: 4]    │  ← CHANGED: Numeric only
│  No remarks     │
└─────────────────┘
```

---

## Data Flow

```text
review_submissions table
├── achieved_value (Self's value)
├── manager_achieved_value
├── auditor_achieved_value
└── management_achieved_value
        ↓
KpiJourneySection
├── stageData.self.achievedValue
├── stageData.manager.achievedValue
├── stageData.auditor.achievedValue
└── stageData.management.achievedValue
        ↓
ReviewStageCard
├── Display: "Value: {achievedValue}"
└── Display: "Rating: {score}"
```

---

## Validation Checklist

After implementation:
- [ ] Each stage shows the achieved value submitted at that level
- [ ] Self stage shows `achieved_value` from submission
- [ ] Manager stage shows `manager_achieved_value`
- [ ] Auditor stage shows `auditor_achieved_value`
- [ ] Management stage shows `management_achieved_value`
- [ ] Rating badges show only numbers (e.g., "Rating: 4")
- [ ] No descriptive labels like "Outstanding" appear
- [ ] N/A KPIs still display correctly
- [ ] Pending stages show "Pending" instead of values

