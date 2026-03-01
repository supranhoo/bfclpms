

# Fix: AuditKpiAssignPopover Not Responding to Clicks

## Root Cause

The `Badge` component (`src/components/ui/badge.tsx`) is a plain function component that does **not** use `React.forwardRef`. When used inside `PopoverTrigger asChild`, Radix UI needs to attach a `ref` to the child element to manage positioning and click handling. Since `Badge` can't accept a ref, the popover opens momentarily but immediately closes, making it appear as if nothing happened.

The console confirms this: *"Function components cannot be given refs. Attempts to access this ref will fail."*

## Fix (Two Options -- will apply both)

### Option A: Make `Badge` support refs (recommended long-term fix)

Update `src/components/ui/badge.tsx` to use `React.forwardRef`. This fixes the issue everywhere `Badge` is used as a trigger child, not just in this popover.

### Option B: Wrap the Badge trigger in a native element (backup)

In `AuditKpiAssignPopover.tsx`, wrap the `Badge` inside a `<button>` element so Radix can attach its ref to the native element instead.

**I will apply Option A** since it's the proper fix and prevents the same issue from recurring elsewhere.

## Changes

### `src/components/ui/badge.tsx`
- Convert `Badge` from a plain function to `React.forwardRef` so it properly forwards refs to its underlying `div` element.

### Files Summary

| File | Change |
|------|--------|
| `src/components/ui/badge.tsx` | Add `React.forwardRef` to `Badge` component |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Regression | None | `forwardRef` is additive; existing Badge usage is unaffected |
| Data Impact | None | UI-only change |

