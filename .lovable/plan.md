

# Move Admin Buttons to Bottom-Right of KPI Header Card

Move the "Admin KPI Editor" and "Admin Data Entry" buttons from above the card to inside the card, positioned at the bottom-right corner (the red-highlighted area in the screenshot).

## Change

**`src/components/review/KpiHeaderSection.tsx`**:
1. Remove the admin buttons `div` from above the `bg-muted/30` card (lines 68-80)
2. Place the same buttons inside the card, after the KRA/KPI text, right-aligned using `flex justify-end`

