
# Plan: Rename Buttons on My KPIs Page

## Summary

Update two button labels on the My KPIs page to simplify the UI language.

## Changes

### 1. src/pages/MyKpis.tsx - Line 543

**Table Row Action Button**

```tsx
// BEFORE
<FileCheck className="h-3.5 w-3.5 mr-1" />
Accept & Submit

// AFTER
<FileCheck className="h-3.5 w-3.5 mr-1" />
Review
```

### 2. src/pages/MyKpis.tsx - Line 819

**Sheet Footer Submit Button**

```tsx
// BEFORE
{submitReview.isPending ? 'Submitting...' : 'Review & Submit'}

// AFTER
{submitReview.isPending ? 'Submitting...' : 'Submit'}
```

## Visual Result

```text
Table Row:
┌────────────────────────────────┐
│ [📋 Review]  [🕐]              │  ← Changed from "Accept & Submit"
└────────────────────────────────┘

Sheet Footer:
┌────────────────────────────────┐
│ [Cancel]           [Submit]    │  ← Changed from "Review & Submit"
└────────────────────────────────┘
```

## Files to Modify

| File | Line | Change |
|------|------|--------|
| src/pages/MyKpis.tsx | 543 | "Accept & Submit" → "Review" |
| src/pages/MyKpis.tsx | 819 | "Review & Submit" → "Submit" |
