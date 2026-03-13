

# Fix: Tiered KPI Label Input Loses Focus After Each Keystroke

## Root Cause

In `TieredOptionsBuilder.tsx` line 96, the React `key` for each option card includes `option.label`:

```tsx
key={`${option.rating}-${option.label}-${index}`}
```

Every character typed changes the label, which changes the key, causing React to **unmount and remount** the entire card. The input loses focus immediately, so the user can only type one character at a time.

## Fix

Change the key to use only the `index`, which is stable across edits:

```tsx
key={index}
```

## Files Modified

1. **`src/components/admin/TieredOptionsBuilder.tsx`** — line 96: change key prop

