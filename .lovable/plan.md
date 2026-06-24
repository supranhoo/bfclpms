## Issue

The "Review your self-assessment before submitting" dialog (`SelfReviewSummaryDialog.tsx`) becomes unscrollable when content exceeds the viewport. With a 1903×855 screen and a tall template (Qualitative Responses + criteria + evidence list), the content overflows the dialog body but the inner scroll surface doesn't actually scroll — the user is stuck and the footer "Cancel / Confirm & Submit" is unreachable.

## Root cause

The dialog uses shadcn's `<ScrollArea>` wrapped in a flex column:

```
<DialogContent className="... max-h-[90vh] flex flex-col overflow-hidden">
  <DialogHeader .../>
  <ScrollArea className="flex-1 min-h-0 h-full">…</ScrollArea>
  <DialogFooter .../>
</DialogContent>
```

Radix `ScrollArea`'s internal viewport reads its parent's *measured* height via CSS, not flex. In a `flex-1 min-h-0` parent the Radix viewport gets `height: 100%` of a zero-intrinsic-height box, so the scroll thumb never appears and the wheel/touch events get swallowed by the underlying div. This is a known shadcn-in-Dialog pitfall.

## Fix

Replace the `<ScrollArea>` body with a plain native-scroll container — the standard shadcn-Dialog pattern that works reliably inside `max-h-[90vh] flex flex-col`:

```
<div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
  <div className="px-6 py-5 space-y-6">…existing children…</div>
</div>
```

Single-file change to `src/components/annual-review/SelfReviewSummaryDialog.tsx` (lines 80 and 261). Remove the `ScrollArea` import too.

## Risk & Impact

- **UI:** Scrollbar is the browser-native one instead of the shadcn styled thumb. Acceptable trade-off for reachability; matches the pattern already used in other long dialogs in this codebase.
- **Workflow / scoring:** None.
- **Regression:** Minimal — only the inner scroll surface changes.
- **Rollback:** Re-introduce `<ScrollArea>`.

## Tests / Docs

- Add a render smoke test (or extend the existing one) asserting the dialog body has `overflow-y-auto` and `max-h` constrained.
- DOCUMENTATION.md → append a v2.66.58 entry noting the scroll fix.
- POLICY.md → add a one-liner: "Long dialogs MUST use native `overflow-y-auto` inside `max-h-[90vh] flex flex-col`, not Radix `ScrollArea` (which fails to size in a flex parent)."

## Out of scope

- No styling/content change to the dialog body. The footer width/clip you see in the screenshot is the underlying page's Save button (outside the dialog), not a dialog-footer issue.
