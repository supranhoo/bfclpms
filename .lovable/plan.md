
# Plan: Mandatory N/A Reason with 50 Character Minimum

## Summary

When a user marks a KPI as "N/A (Not Applicable)", the "Reason for N/A" field becomes mandatory with a minimum of 30 characters before submission is allowed.

## Changes

### 1. src/pages/MyKpis.tsx - Line 818 (Submit Button)

**Update button disabled logic**

```tsx
// BEFORE
<Button size="sm" onClick={handleSubmitReview} disabled={(!isNa && !achievedValue) || submitReview.isPending}>

// AFTER
<Button 
  size="sm" 
  onClick={handleSubmitReview} 
  disabled={
    (!isNa && !achievedValue) || 
    (isNa && selfRemarks.trim().length < 50) || 
    submitReview.isPending
  }
>
```

### 2. src/pages/MyKpis.tsx - Lines 789-798 (Textarea Label)

**Add character count indicator and validation message**

```tsx
// BEFORE
<Label htmlFor="remarks" className="text-sm mb-2 block">
  {isNa ? 'Reason for N/A' : 'Justification'}
</Label>
<Textarea
  id="remarks"
  value={selfRemarks}
  onChange={(e) => setSelfRemarks(e.target.value)}
  placeholder={isNa ? 'Explain why this KPI is not applicable...' : 'Describe your achievements...'}
  className="resize-none min-h-[100px]"
/>

// AFTER
<div className="flex justify-between items-center mb-2">
  <Label htmlFor="remarks" className="text-sm">
    {isNa ? 'Reason for N/A *' : 'Justification'}
  </Label>
  {isNa && (
    <span className={`text-xs ${selfRemarks.trim().length < 50 ? 'text-destructive' : 'text-muted-foreground'}`}>
      {selfRemarks.trim().length}/50 characters minimum
    </span>
  )}
</div>
<Textarea
  id="remarks"
  value={selfRemarks}
  onChange={(e) => setSelfRemarks(e.target.value)}
  placeholder={isNa ? 'Explain why this KPI is not applicable (minimum 50 characters)...' : 'Describe your achievements...'}
  className={`resize-none min-h-[100px] ${isNa && selfRemarks.trim().length < 50 && selfRemarks.length > 0 ? 'border-destructive' : ''}`}
/>
{isNa && selfRemarks.trim().length < 50 && selfRemarks.length > 0 && (
  <p className="text-xs text-destructive mt-1">
    Please provide at least 50 characters ({50 - selfRemarks.trim().length} more needed)
  </p>
)}
```

## Visual Result

```text
When N/A is checked:
┌─────────────────────────────────────────────────────┐
│ Reason for N/A *                    12/50 minimum   │  ← Red count
├─────────────────────────────────────────────────────┤
│ Too short text...                                   │  ← Red border
├─────────────────────────────────────────────────────┤
│ Please provide at least 50 characters (38 more)    │  ← Error message
└─────────────────────────────────────────────────────┘

Footer:
│ [Cancel]                    [Submit] ← Disabled     │

After 50+ characters:
┌─────────────────────────────────────────────────────┐
│ Reason for N/A *                    55/50 minimum   │  ← Gray count
├─────────────────────────────────────────────────────┤
│ This KPI is not applicable because the department...│  ← Normal border
└─────────────────────────────────────────────────────┘

Footer:
│ [Cancel]                    [Submit] ← Enabled      │
```

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| src/pages/MyKpis.tsx | 789-798 | Add character counter and validation message |
| src/pages/MyKpis.tsx | 818 | Update disabled logic for Submit button |

## Validation Logic

```text
Submit button enabled when:
├── Normal KPI: achievedValue is provided
└── N/A KPI: selfRemarks.trim().length >= 50
```
