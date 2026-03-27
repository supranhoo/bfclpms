

## Make Program Name & Details Editable via Edit Dialog

### Problem
The Edit (pencil) icon on each program card currently toggles `is_active` status instead of opening an edit form. Program names like "PortI ncentive" (typos) cannot be corrected.

### Change
Add an Edit Program dialog (reusing the same form as Create) that opens when the pencil icon is clicked, pre-populated with current program data (name, type, description, effective dates, active status). On save, call `updateProgram.mutate()`.

### Implementation — `src/pages/admin/IncentiveConfig.tsx`

**1. Add edit state**
- `const [editProgram, setEditProgram] = useState<any>(null)` — when set, opens edit dialog

**2. Replace Edit button action (line 117-124)**
- Change `onClick` from toggling `is_active` to: `setEditProgram(p)` — opens the edit dialog pre-filled

**3. Add Edit Program Dialog**
- Mirror the Create dialog structure but pre-fill fields from `editProgram`
- Fields: Name, Program Type, Description, Effective From, Effective To, Active toggle
- On save: `updateProgram.mutate({ id: editProgram.id, name, program_type, description, effective_from, effective_to, is_active })`

**4. Documentation** — Update `DOCUMENTATION.md` and `POLICY.md` version history

### Files Changed
1. `src/pages/admin/IncentiveConfig.tsx` — add edit state, edit dialog, update button handler
2. `DOCUMENTATION.md` — version history
3. `POLICY.md` — version history

### Risk Assessment
- **Data Impact**: None — uses existing `useUpdateProgram` mutation
- **Regression Risk**: Zero — replaces a toggle with a proper edit form

