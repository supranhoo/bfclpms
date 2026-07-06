## Problem

In the Template Editor → **Self Review Fields**, the "Field Label" input rejects all keystrokes — the user cannot type anything. The Placeholder input (a plain `<Input>`) works fine.

## Root Cause

`src/components/annual-review/SelfReviewLabelCombobox.tsx` wraps the `<Input>` inside a Radix `<PopoverTrigger asChild>`. `PopoverTrigger` injects its own click/keyboard/focus behavior and, combined with the controlled `open` state being recomputed on every keystroke (`showPanel = open && value.length >= 2 && matches.length > 0`), Radix's focus management steals focus from the input as the popover opens/closes on each character — so keystrokes never register in the underlying `<input>`.

This is the wrong Radix primitive for an inline suggestion dropdown attached to a free-text input. The correct primitive is `<PopoverAnchor>` (positions the popover without hijacking the input) — or a plain absolute-positioned suggestion panel.

## Fix (surgical, UI-only)

Rewrite `SelfReviewLabelCombobox.tsx` to:

1. Render the `<Input>` directly (no `PopoverTrigger` wrapping it).
2. Use `<PopoverAnchor asChild>` around a positioning `<div>` that contains the `<Input>`, so the suggestion popover anchors to the input without intercepting focus or key events.
3. Keep the same public props (`value`, `onChange`, `onPickLibraryEntry`, `placeholder`) — no changes required in `TemplateEditorDialog.tsx`.
4. Preserve existing behaviour: suggestions appear when `value.length >= 2` and library matches exist; picking a suggestion calls `onPickLibraryEntry`; free-text entry remains allowed.
5. Add `onOpenAutoFocus` + `onCloseAutoFocus` `preventDefault` on `PopoverContent` so focus stays in the input while the panel opens/closes.

No changes to services, hooks, types, DB, RLS, or the library-picker flow.

## Files touched

- `src/components/annual-review/SelfReviewLabelCombobox.tsx` — rewrite internals only; same exported API.

## Verification

1. Type-check: `tsgo --noEmit`.
2. Manual (Playwright): open Template Editor → Self Review Fields → **Add Field** → focus "Field Label" → type "abc"; assert the input `value === "abc"` and the suggestion popover renders below without stealing focus. Screenshot for evidence.
3. Regression: confirm clicking a library suggestion still populates label/placeholder/required via `onPickLibraryEntry`.

## Risk & Impact

- **Data**: none.
- **Workflow**: none.
- **UI/UX**: identical visual layout; suggestion panel still anchored to the input.
- **Regression risk**: low — change is isolated to one presentational component with an unchanged prop contract.
- **Rollback**: revert the single file.
