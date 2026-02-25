

# Add "Assign Data Owners" Button to Data Entry Card Footer (v1.46.3)

## Overview

Add an "Assign Data Owners" button in the footer of each KPI card on the **Data Entry** tab, positioned between the existing "Impact" and "Remove" buttons. This allows admins to assign data owners directly from the data entry view without switching to the Data Owners tab.

## UI Placement

Current footer:
```
[History] [Impact] [Remove]                    [Propagate]
```

After:
```
[History] [Impact] [Data Owners] [Remove]      [Propagate]
```

The button will use the `Users` icon with ghost styling, consistent with the History and Impact buttons.

## Technical Changes

### 1. Update `OrgKpiEntryCard.tsx`

- Import `OrgKpiOwnerDialog` component and add `useState` for dialog open state
- Add a "Data Owners" ghost button (Users icon) in the footer actions area, after the Impact button
- Render the `OrgKpiOwnerDialog` at the bottom of the card, controlled by the local state
- Only show for admin users (`isAdmin` prop)

### 2. No other file changes needed

The `OrgKpiOwnerDialog` is a self-contained component that handles all owner CRUD internally (search, assign, remove). It only needs `categoryId`, `kraName`, and `kpiName` props -- all already available in the card's `data` prop.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Reuses existing dialog and hooks |
| Regression | None | Additive change only, no existing logic modified |
| UI consistency | Good | Uses same button style as History/Impact |

