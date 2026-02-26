

# Fix: Review Journey Remarks Not Readable on Mobile/Tablet (v1.46.13)

## Problem

The Review Journey stage cards truncate remarks to 2 lines and rely on a **hover tooltip** to reveal the full text. On mobile and tablet devices, there is no hover interaction, so the full remarks are completely inaccessible to users.

## Solution

Replace the tooltip-based approach with a **tap-to-expand** pattern on mobile/tablet. On desktop, the tooltip continues to work as before.

- On small screens: tapping the remarks text toggles between truncated (`line-clamp-2`) and full display
- On desktop: the existing tooltip behavior is preserved

## File to Change

**`src/components/review/ReviewStageCard.tsx`**

1. Add a `useState` for `expanded` toggle
2. Import `useIsMobile` from `@/hooks/use-mobile`
3. For mobile: render the remarks as a tappable `<p>` that toggles between `line-clamp-2` and full text, with a small visual hint ("tap to read")
4. For desktop: keep the existing `TooltipProvider` / `Tooltip` behavior unchanged

## Technical Detail

```text
Mobile/Tablet (touch):
+---------------------------+
| 58 joined, training       |
| imparted to 58 as per...  |  <-- tap to expand
+---------------------------+
         |  tap
         v
+---------------------------+
| 58 joined, training       |
| imparted to 58 as per     |
| the compliance            |
| requirement successfully  |  <-- tap to collapse
+---------------------------+

Desktop (mouse):
  Unchanged -- tooltip on hover
```

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | UI-only change |
| Regression | None | Desktop tooltip behavior unchanged |
| UX | Positive | Remarks become fully readable on touch devices |

