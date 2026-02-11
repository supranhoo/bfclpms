
Goal: Make “KRA Rollover → Step 2: Preview” clearly scrollable so all employees (e.g., 8 conflicts) can be viewed, and the scrollbar is visible (not “hidden/unclear”).

What’s happening now (based on code + your screenshot)
- The dialog uses: <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">.
- Inside it, the content is wrapped in <ScrollArea className="flex-1 min-h-0 pr-4">.
- Even with min-h-0, a flex child can still fail to become scrollable when the parent’s height is “not definite” (only max-height). In that situation, the ScrollArea can size itself to its content (so no internal overflow is created), and the extra rows get cut off by the dialog viewport, with no usable scroll.

Fix strategy (robust + user-friendly)
1) Give the dialog a definite height only when scrolling is needed (Preview/Results)
   - In src/components/admin/RolloverDialog.tsx:
     - Change DialogContent className to be conditional by step:
       - Step = config: keep current behavior (auto height, up to max-h[85vh]).
       - Step = preview/results: force a definite height so flex layout can compute and the ScrollArea gets a real bounded height.
   - Example intent (not exact code yet):
     - config: "max-w-3xl max-h-[85vh] flex flex-col"
     - preview/results: "max-w-3xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden"
   - Why: h-[85vh] makes the container’s height definite, so flex-1 on ScrollArea becomes a real height and Radix can enable internal scrolling reliably.

2) Make the scrollbar visible (so users know scrolling exists)
   - Update the ScrollArea usage in RolloverDialog to always show the scrollbar:
     - Add Radix prop: type="always"
     - Keep: className="flex-1 min-h-0 pr-4"
   - Why: Even when scrolling works, the scrollbar can be subtle; “always” makes it obvious.

3) (Optional, recommended UX improvement) Keep action buttons always accessible
   - Current layout places the “Back / Proceed with Rollover” buttons inside the scroll area, so they can scroll out of view.
   - Improve by moving the button row outside ScrollArea (fixed at bottom of the dialog), while keeping the long table inside the ScrollArea.
   - This is not strictly required to “enable scrolling”, but it prevents confusion and makes the workflow smoother when there are many rows.

4) Update DOCUMENTATION.md
   - Add/adjust a short note under the KRA Rollover section:
     - Step 2 preview is scrollable (conflict list may be long).
     - Scrollbar is visible; users can scroll to view all employees.

Files to change
- src/components/admin/RolloverDialog.tsx
  - Conditional DialogContent sizing (definite height for preview/results)
  - ScrollArea: add type="always"
  - (Optional) Move footer buttons outside the ScrollArea for better usability
- DOCUMENTATION.md
  - Document the Step 2 preview scrolling behavior

Acceptance checks (what you will verify after implementation)
- Open KRA Rollover → Step 2: Preview where “Have existing KPIs” shows 8.
- Confirm you can scroll down within the dialog and see all 8 employees.
- Confirm a visible scrollbar appears (no guessing).
- Confirm Back / Proceed buttons are reachable (and ideally always visible if we do the optional UX improvement).
