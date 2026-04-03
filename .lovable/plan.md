

## Fix: Eye Icon "Click to Expand" Not Working

### Problem
In the `BrowserTemplateCard` component, clicking the Eye (👁) icon triggers the parent row's checkbox toggle instead of expanding the template details. Although `e.stopPropagation()` is present, the click event still bubbles to the parent `div` with `onClick={onToggle}`.

### Root Cause
The Eye button is inside a parent `div` with `onClick={onToggle}` (line 562). The `stopPropagation` call on the button click handler should work, but the small hit target (h-6 w-6) means clicks sometimes land on the surrounding padding/card area instead of the button itself. Additionally, the button's ghost variant has minimal visual affordance, making it unclear that it's interactive.

### Fix (1 file)

**`src/pages/admin/BundleEditor.tsx`** — `BrowserTemplateCard` component:

1. Move the Eye button **outside** the clickable toggle row, or restructure so the checkbox area and the eye button are separate click zones:
   - Split the row into two zones: left side (checkbox + info, triggers toggle) and right side (eye button, triggers expand)
   - Use `onMouseDown` + `preventDefault` + `stopPropagation` as a more robust event stopper

2. Improve the Eye button UX:
   - Make the icon slightly larger and add a tooltip ("View details")
   - Change icon to `ChevronDown`/`ChevronUp` when expanded (clearer expand/collapse affordance)
   - Add visual feedback: highlight the eye button area on hover

3. Ensure the expanded section is visually distinct and doesn't collapse when clicking inside it.

### Technical Detail
The fix restructures `BrowserTemplateCard` so that `onToggle` is only bound to the checkbox+label area, and the Eye/expand button is a sibling element with its own isolated click handler — eliminating any event bubbling issues.

