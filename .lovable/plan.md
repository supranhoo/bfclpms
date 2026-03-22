

## Fix: Hide UUIDs in MentionTextarea (Always Show Clean Text)

### Problem
When the textarea is focused, the raw mention markup `@[Umesh Kumar Mehta](adfab1e8-fc45-...)` is visible to the user. UUIDs should never be shown — the user should always see just `@Umesh Kumar Mehta`.

### Root Cause
Line 160 of `MentionTextarea.tsx`: when focused, the textarea value is the raw `value` (containing `@[Name](uuid)` markup). This was done to fix a cursor alignment issue, but it exposes internal markup to users.

### Solution
Always display clean text (no UUIDs) in the textarea. Map user edits from display-text coordinates back to raw-text coordinates using a position mapping utility.

### Changes

#### File: `src/lib/mentionUtils.ts`

Add two new utility functions:

1. **`buildDisplayToRawMap(rawText)`** — Scans the raw text for mention patterns and builds an array that maps each display-text character index to its corresponding raw-text index. Mentions like `@[Name](uuid)` (raw) map to `@Name` (display), so display indices within a mention map to the mention's start in raw text.

2. **`applyDisplayEditToRaw(oldRaw, oldDisplay, newDisplay, cursorInNew)`** — Given the old raw text, old display text, new display text (after user edit), and cursor position, determines what changed (insertion, deletion, or replacement) and applies the equivalent edit to the raw text. If an edit touches part of a mention token, the entire mention is removed from raw text.

#### File: `src/components/ui/MentionTextarea.tsx`

1. **Remove `isFocused` state** — no longer needed since text appearance is the same focused or not.

2. **Textarea value**: Always show `getDisplayText(value)` — never the raw value.

3. **Overlay**: Always show `renderMentionText(value)` overlay with `pointer-events-none`, textarea text always transparent. Cursor is visible via `caret-foreground`. Since display text and overlay now have identical character lengths, the cursor aligns perfectly.

4. **`handleInput`**: Instead of `onChange(newValue)` directly, use `applyDisplayEditToRaw(value, oldDisplayText, newDisplayText, cursor)` to compute the new raw value, then call `onChange(newRawValue)`. Store old display text in a ref for diffing.

5. **`selectUser`**: After `insertMention` produces new raw text, compute the display-text cursor position (raw cursor minus the UUID overhead) and set selection accordingly.

6. **`@` trigger detection**: The trigger detection logic works on the display text (textarea value), which is fine since `@` characters are preserved in display text.

### No database changes needed

