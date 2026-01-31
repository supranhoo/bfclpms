

# Plan: Fix "Submit Month" Button Visibility

## Problem Analysis

The "Submit Month" button is not visible to users. After investigation, I identified the following potential causes:

### Current Button Visibility Conditions (Line 1264)
```tsx
{needsSubPeriodForKpi && selectedKpiSubPeriods.length > 0 && selectedKpi?.status === 'kra_set' && (
  <Button ...>Submit Month</Button>
)}
```

All THREE conditions must be met:
| Condition | What It Checks |
|-----------|----------------|
| `needsSubPeriodForKpi` | KPI frequency is "Daily" or "Weekly" |
| `selectedKpiSubPeriods.length > 0` | At least one sub-period entry exists for this KPI in the current review period |
| `selectedKpi?.status === 'kra_set'` | KPI hasn't been submitted yet |

### Potential Issues Found

1. **Page Location**: The button only exists on `/my-kpis`, not on admin pages like `/admin/kpis`

2. **Missing Sub-Period Submissions**: The `selectedKpiSubPeriods` array might be empty because:
   - The user hasn't entered any daily/weekly values yet
   - The query filters by `review_month` and `review_year` - if these don't match the KPI's period, no submissions are returned

3. **Status Check**: If the KPI status is anything other than `kra_set` (e.g., already submitted), the button won't appear

## Proposed Solutions

### Fix 1: Improve Button Discoverability
Show a helper message when conditions aren't fully met, guiding users to understand what's needed.

### Fix 2: Add Console Debugging (Temporary)
Add conditional logging to help diagnose the exact condition that's failing.

### Fix 3: Visual Indicator in Footer
Show the button in a disabled state with tooltip explaining why it can't be used yet, rather than hiding it completely.

## Implementation Details

### Changes to `src/pages/MyKpis.tsx`

**1. Add debug info to understand why button is hidden** (around line 1262)

Replace the current button rendering with a more informative approach:

```tsx
{/* Submit Month Button Section */}
{needsSubPeriodForKpi && (
  <>
    {selectedKpiSubPeriods.length === 0 ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
              <Send className="h-3 w-3" />
              Submit Month
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Enter at least one {selectedKpi?.frequency?.toLowerCase()} value first
        </TooltipContent>
      </Tooltip>
    ) : selectedKpi?.status !== 'kra_set' ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
              <Send className="h-3 w-3" />
              Month Submitted
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          This KPI has already been submitted for the month
        </TooltipContent>
      </Tooltip>
    ) : (
      <Button 
        size="sm"
        onClick={() => setShowMonthlySubmitConfirm(true)}
        className="gap-1"
        disabled={isSubmittingMonthly}
      >
        <Send className="h-3 w-3" />
        Submit Month
      </Button>
    )}
  </>
)}
```

This change:
- Shows a **disabled** "Submit Month" button for Daily/Weekly KPIs even when conditions aren't met
- Provides **tooltip explanations** for why the button is disabled
- Makes the workflow **discoverable** instead of hiding the action entirely

### Visual Summary

| Scenario | Current Behavior | New Behavior |
|----------|------------------|--------------|
| Daily KPI, no entries | Button hidden | Disabled button with tooltip "Enter at least one daily value first" |
| Daily KPI, has entries, status=kra_set | Button shown | Button enabled (no change) |
| Daily KPI, already submitted | Button hidden | Disabled button with "Month Submitted" |
| Monthly KPI | Button hidden | No button (correct - not applicable) |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Replace hidden button with always-visible button that shows disabled state with tooltips |
| `DOCUMENTATION.md` | Document the Submit Month button behavior |

## Testing Checklist

- Navigate to My KPIs page (not admin page)
- Select a Daily or Weekly KPI with `kra_set` status
- Verify "Submit Month" button appears (disabled if no entries)
- Enter a daily value and save
- Verify button becomes enabled
- Click Submit Month and verify confirmation dialog
- After submission, verify button shows "Month Submitted" (disabled)

