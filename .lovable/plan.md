

## RCA: Cursor Misalignment in Add Observation Dialog

### Root Cause

The `MentionTextarea` component (`src/components/ui/MentionTextarea.tsx`) uses a **transparent-textarea-over-visual-overlay** pattern:

- A `<div>` overlay (line 146-156) renders formatted text using `renderMentionText(value)` — this converts raw mention markup like `@[John Doe](uuid-123)` into styled `<span>` elements showing just "John Doe".
- A `<textarea>` (line 157-169) sits on top with `text-transparent` (invisible text) but `caret-foreground` (visible cursor).

**The problem**: The raw text in the textarea (e.g. `@[John Doe](abc-123-uuid) please check`) has a completely different character count and width than what the overlay renders (e.g. `John Doe please check`). So:

- The **caret** is positioned based on the raw textarea string (which includes `@[...](uuid)` markup).
- The **visible text** is rendered by the overlay using the short display names.

After any mention is inserted, the caret jumps ahead (because the raw string is longer), while the visible text is shorter — creating the "cursor is somewhere else, typing happens somewhere else" effect.

### Fix

**File: `src/components/ui/MentionTextarea.tsx`**

Replace the overlay approach with a simpler one: make the textarea text **visible** (not transparent) and only show the formatted overlay when the textarea is **not focused**. When focused, the user sees the raw text with the caret in the correct position. When blurred, the overlay shows the pretty-formatted mentions.

Changes:
1. Add a `isFocused` state (default `false`).
2. On the textarea: add `onFocus` / `onBlur` handlers to toggle `isFocused`.
3. When focused: textarea uses normal `text-foreground` (visible text, visible caret), overlay is hidden.
4. When blurred: textarea uses `text-transparent`, overlay is shown with formatted mentions.
5. This ensures the caret always matches the visible text while editing.

### No database changes needed

