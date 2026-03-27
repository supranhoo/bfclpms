

## Add Binary Polarity (Inverted Scoring) Toggle to KRA Assignment Dialog

### Problem
The "Assign New KRA" dialog (`AdminKpiCreateDialog.tsx`) hardcodes `BINARY_OPTIONS` (Yes=5, No=0) for binary KPIs. There is no option to select inverted polarity (No=5, Yes=0) for safety-type KPIs like LTI — unlike the Admin KPI Editor and Template forms which already have this toggle.

### Change
Replace the static "Binary Scoring" display (lines 1001-1010) with a Binary Polarity selector matching the pattern used in `AdminKpiEditorForm.tsx`. Also update the save logic (line 312) to use the selected polarity's options instead of always using `BINARY_OPTIONS`.

### Implementation — `src/components/admin/AdminKpiCreateDialog.tsx`

**1. Add state for binary polarity**
- Add `import { BINARY_OPTIONS_INVERTED, isBinaryInverted } from '@/lib/qualitativeUom'` (BINARY_OPTIONS already imported)
- Add state: `const [binaryInverted, setBinaryInverted] = useState(false)`
- When KPI is selected from library search and has inverted qualitative_options, set `setBinaryInverted(true)`

**2. Replace static Binary Scoring display (lines 1001-1010)** with:
- A polarity selector (Standard/Inverted dropdown) + dynamic badge display
- Pattern: copy from `AdminKpiEditorForm.tsx` lines 658-697

**3. Update save payload (line 312)**
- Change: `qualitative_options: uomType === 'binary' ? BINARY_OPTIONS : ...`
- To: `qualitative_options: uomType === 'binary' ? (binaryInverted ? BINARY_OPTIONS_INVERTED : BINARY_OPTIONS) : ...`

**4. Sync from library selection**
- In the `onSelectKpi` handler, when setting qualitative_options from a library KPI, also set `setBinaryInverted(isBinaryInverted(source.qualitative_options))`

### Files
1. `src/components/admin/AdminKpiCreateDialog.tsx` — add polarity state, UI toggle, save logic
2. `DOCUMENTATION.md` — version history
3. `POLICY.md` — version history

### Risk Assessment
- **Data Impact**: None — additive change to existing field
- **Regression Risk**: Zero — only changes what was previously hardcoded to standard polarity

