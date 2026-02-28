

# Fix: Make MentionTextarea Text Color Lighter

## Problem
The text rendered in the MentionTextarea overlay appears too dark. The component uses a transparent textarea with a visual overlay behind it that displays the formatted text. The overlay inherits the default `foreground` color, making the text appear bold/dark.

## Solution

**File: `src/components/ui/MentionTextarea.tsx`**

Add `text-muted-foreground` to the overlay `div` (around line 147) so the rendered text appears in a lighter, softer tone instead of the full-contrast foreground color.

```text
Current:  className="absolute inset-0 min-h-[80px] w-full rounded-md px-3 py-2 text-sm pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
New:      className="absolute inset-0 min-h-[80px] w-full rounded-md px-3 py-2 text-sm text-muted-foreground pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
```

This single class addition will make all non-mention text lighter while @mention highlights (rendered by `renderMentionText`) retain their distinct styling.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/ui/MentionTextarea.tsx` | Add `text-muted-foreground` class to overlay div |

