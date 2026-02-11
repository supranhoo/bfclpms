

# Fix: Achieved & Rating Showing Blank in KPI Tracker Modal

## Root Cause Analysis

The issue stems from **JavaScript's falsy value handling** — the well-known zero-value preservation problem.

### Bug 1: Display renders 0 as "-"

In the Monthly Detail Log table (line ~149 of KpiTrackerModal.tsx):

```typescript
// Current code
<TableCell>{entry.achieved || '-'}</TableCell>
```

When `achieved_value = 0` (e.g., December has `achieved_value: 0.00`), JavaScript treats `0` as falsy, so `0 || '-'` evaluates to `'-'`. Same issue with rating display — `entry.rating > 0` excludes legitimate zero ratings.

### Bug 2: Data construction loses zero values

```typescript
// Current code
achieved: sub?.achieved_value || 0,
```

This is partially correct (0 || 0 still gives 0), but the real problem is distinguishing between "no submission exists" (should show "-") vs "submission exists with value 0" (should show "0").

### Database Evidence

For the KPI "Fulfillment of Vacant Positions" (employee 35bb4caa):

| Month | achieved_value | final_score | Correct Display |
|-------|---------------|-------------|-----------------|
| September 2025 | NULL (no submission) | NULL | Should show "-" |
| October 2025 | 96.00 | 4.00 | Should show 96 / 4.0 |
| November 2025 | 91.38 | 3.00 | Should show 91.38 / 3.0 |
| December 2025 | 0.00 | 0.00 | Should show 0 / 0.0 |

## Fix

### File: `src/components/dashboard/KpiTrackerModal.tsx`

**1. Change data types to use `null` for missing data:**

```typescript
// Before
achieved: sub?.achieved_value || 0,
rating: sub?.final_score ?? sub?.management_score ?? ... ?? 0,

// After - use null to represent "no data"
achieved: sub ? (sub.achieved_value ?? null) : null,
rating: sub ? (sub.final_score ?? sub.management_score ?? sub.auditor_score ?? sub.manager_score ?? sub.self_score ?? null) : null,
```

**2. Fix display logic to preserve zero values:**

```typescript
// Before
<TableCell>{entry.achieved || '-'}</TableCell>

// After - null means no data, 0 is a valid value
<TableCell>{entry.achieved != null ? entry.achieved : '-'}</TableCell>
```

```typescript
// Before
{entry.rating > 0 ? <Badge>...</Badge> : '-'}

// After
{entry.rating != null ? <Badge>...</Badge> : '-'}
```

**3. Fix chart data to use null instead of 0 for missing points** (so the trend line shows gaps instead of drops to zero):

```typescript
// Before
achieved: sub?.achieved_value || 0,

// After
achieved: sub ? (sub.achieved_value ?? null) : null,
```

**4. Update type definition** to allow null:

```typescript
// Change type from number to number | null
achieved: number | null;
rating: number | null;
```

### File: `DOCUMENTATION.md`

Update the KPI Tracker section to document the null-safe display handling.

## Impact

- **Display only** — no scoring or database changes
- **Chart improvement** — missing months show as gaps instead of false "0" dips
- **Table improvement** — zero values display as "0" / "0.0" instead of "-"
- Consistent with the project's zero-value-preservation standard

