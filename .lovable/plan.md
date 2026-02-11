
# Fix Bold KPI Marker Display Issues

## Problems Identified

1. **Bold markers break mid-phrase** -- "- Scoring Logic:" wraps between words due to narrow column width, making it look like two separate bold sections ("**- Scoring**" on one line, "**Logic:**" on the next).

2. **Non-standard data formats not recognized** -- Some KPI data in the database uses variant formatting that the current regex doesn't match:
   - `Formula - (Project Timeline adherence)` instead of `- Formula:`
   - `Scoring :- 5 for 0 non-compliance` instead of `- Scoring:`
   These don't get bolded, creating visual inconsistency.

## Fix

### 1. `src/components/ui/FormattedText.tsx`

Add `white-space: nowrap` to `<strong>` elements so bold markers never split across lines:

```typescript
// Before
React.createElement('strong', { key: i }, seg.text)

// After
React.createElement('strong', { key: i, style: { whiteSpace: 'nowrap' } }, seg.text)
```

### 2. `src/lib/textFormatting.ts`

Expand both regex patterns to also match non-standard marker variants found in the database:

**Current patterns only match:** `- Description:`, `- Formula:`, `- Scoring Logic:`, `- Scoring:`

**Updated patterns will also match:**
- `Formula -` (dash after keyword, no colon)
- `Scoring :-` (colon-dash variant)
- `Formula :` (space before colon)
- `-Description:` (no space after dash)

Updated `normalizeKpiText` pattern:
```text
Matches: - Description:, -Description:, - Formula:, Formula -, - Scoring Logic:, 
         Scoring Logic -, - Scoring:, Scoring :-, - Criteria:, - Measurement:, 
         - Target:, - Notes:
```

Updated `BOLD_MARKER_PATTERN`:
Same expanded set for consistent bolding.

### 3. `DOCUMENTATION.md`

Update the text formatting section to note the expanded pattern matching and `nowrap` styling.

## Impact

- **No logic impact** -- display-only change
- **No export impact** -- PDF/Excel use raw strings
- **No scoring impact** -- scoring uses numeric fields only
- Applies everywhere `renderBoldKpiText` is used (all dashboard tables, review panels, modals)
