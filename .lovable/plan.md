

# Plan: Full Transparency - Show All Review Stages to All Levels

## Overview

This is a straightforward change to ensure **all users see all 4 review stages** (Self, Manager, Auditor, Management) regardless of their role. This provides complete transparency into the entire review workflow.

---

## Current Behavior (Problem)

| Level | Stages Visible |
|-------|---------------|
| Employee | Self only |
| Manager | Self, Manager |
| Auditor | Self, Manager, Auditor |
| Management | All 4 |

---

## New Behavior (Solution)

| Level | Stages Visible |
|-------|---------------|
| Employee | All 4 (Self, Manager, Auditor, Management) |
| Manager | All 4 |
| Auditor | All 4 |
| Management | All 4 |

Each stage will display its current state:
- **Completed** (green checkmark, shows score/remarks)
- **Current** (highlighted ring, active stage)
- **Pending** (muted/grayed out)

---

## Technical Changes

### File: `src/components/review/KpiJourneySection.tsx`

**Change 1**: Simplify `getVisibleStages` function (lines 66-80)

```typescript
// Before: Role-based filtering
function getVisibleStages(viewLevel: ViewLevel): ('self' | 'manager' | 'auditor' | 'management')[] {
  switch (viewLevel) {
    case 'employee':
      return ['self'];
    // ... other cases
  }
}

// After: Always return all 4 stages
function getVisibleStages(viewLevel: ViewLevel): ('self' | 'manager' | 'auditor' | 'management')[] {
  // All levels see all stages for complete transparency
  return ['self', 'manager', 'auditor', 'management'];
}
```

**Change 2**: Simplify grid class (line 135-138)

Since we always show 4 stages, remove the dynamic grid class logic:

```typescript
// Before
const gridCols = visibleStages.length === 1 ? 'grid-cols-1' : ...

// After
// Always 4 columns - no dynamic calculation needed
```

---

## Visual Result

**Employee View (Before):**
```
┌──────────┐
│   SELF   │
│ Score: 4 │
└──────────┘
```

**Employee View (After):**
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│   SELF   │ │ MANAGER  │ │ AUDITOR  │ │   MGMT   │
│ Score: 4 │ │ Pending  │ │ Pending  │ │ Pending  │
│ Exceeds  │ │          │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/KpiJourneySection.tsx` | Update `getVisibleStages` to always return all 4 stages; simplify grid class |
| `DOCUMENTATION.md` | Update to reflect full transparency model |

---

## Testing Checklist

- [ ] My KPIs (Employee) - Shows all 4 stages in the Review Journey
- [ ] Team Review (Manager) - Shows all 4 stages
- [ ] Audit Panel (Auditor) - Shows all 4 stages
- [ ] Management Review - Shows all 4 stages
- [ ] Completed stages display score, rating, and remarks
- [ ] Current stage has visual highlight (ring)
- [ ] Pending stages show "Pending" with muted styling
- [ ] Grid layout is consistent 4-column across all levels

