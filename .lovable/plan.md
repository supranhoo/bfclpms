

# Fix: Hide UUIDs in Mention Textarea

## Problem

When a user selects an @mention, the textarea shows the raw storage syntax including the UUID:
```
I need @[Gaurav Budhia](550e8400-e29b-41d4-a716-446655440000) to verify
```
This is confusing and unprofessional. Users should only see `@Gaurav Budhia` highlighted.

## Solution: Transparent Text + Visual Overlay

Use the well-known "highlight overlay" technique: the textarea's text color is set to `transparent` (so the raw syntax is invisible but still editable), while a `div` overlay behind it renders the formatted version with styled @mentions. The user sees clean highlighted names while the actual value still contains the `@[Name](uuid)` syntax needed for storage.

```text
+--------------------------------------------------+
|  Overlay div (pointer-events: none, z-0)         |
|  "I need @Gaurav Budhia to verify this data..."  |
|        ^^^^^^^^^^^^^^^ (bold, primary color)     |
|                                                  |
|  Textarea (transparent text color, z-10)         |
|  "I need @[Gaurav](uuid-...) to verify this..."  |
|  (invisible but handles all input/selection)      |
+--------------------------------------------------+
```

This approach:
- Preserves all existing keyboard navigation, cursor positioning, and selection behavior
- No contentEditable complexity -- stays as a plain textarea
- The overlay div mirrors the textarea's font, padding, and scroll position exactly
- Caret color is set explicitly so the cursor remains visible

## Changes

### 1. Update `src/components/ui/MentionTextarea.tsx`

- Add a `div` sibling positioned absolutely behind the textarea
- Textarea gets `text-transparent` + `caret-black dark:caret-white` classes
- The overlay div uses `renderMentionText()` to display formatted text with highlighted @mentions
- Sync the overlay's `scrollTop` with the textarea's scroll position via an `onScroll` handler
- Both elements share identical font-size, padding, line-height, and word-wrap styles

### 2. Update `src/lib/mentionUtils.ts`

- Add a new function `getDisplayText(text: string): string` that strips the `(uuid)` part for plain-text display, returning `@Name` instead of `@[Name](uuid)` -- used by the overlay renderer

No database changes. No new files. Single component update + one utility function.

## Technical Detail

The overlay div must match the textarea pixel-perfectly:
- Same `px-3 py-2 text-sm` padding and font
- `whitespace-pre-wrap` + `word-break: break-word` to match textarea wrapping
- `overflow: hidden` on the overlay (textarea handles scrolling)
- `pointer-events: none` so all clicks pass through to the textarea
- Scroll sync: `onScroll` on textarea sets `overlayRef.current.scrollTop = e.target.scrollTop`

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Regression | None | Only changes how text is displayed, not stored |
| Cursor/Selection | None | Textarea still handles all input natively |
| Scrolling | Low | Scroll sync keeps overlay aligned; tested pattern |

