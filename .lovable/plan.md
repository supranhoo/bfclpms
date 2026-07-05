## Assumptions
- The pasted sample is the actual Excel format: one cell contains all lines from `5 - ...` through `0 - ...`.
- The expected result is six scoring bands, each storing English and Hindi labels separately, and the UI should show those labels instead of the generic `Outstanding / Above target / ...` ladder.
- No schema change is needed; this is an import/parser and data-cleanup issue.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** Existing criteria rows may already have empty or generic `scoring_bands`; the fix should repair only Annual Review criteria whose labels match imported rows or whose bands are empty/generic.
- **Workflow Impact:** Import flow remains the same; admins still upload and map sheets. The change only improves parsing and prevents bad imported scoring bands.
- **UI/UX Impact:** No layout redesign. Import warnings should become clearer when a row cannot be parsed.
- **Regression Risk:** Medium, because the parser is shared by criteria import paths. Mitigation is targeted tests using the exact pasted multiline format.
- **Scalability Impact:** Low. Parsing happens client-side per uploaded workbook; no large dataset load is introduced.
- **Rollback Strategy:** Revert parser changes and restore criteria rows from backup if needed; no destructive schema migration.

## Step-by-step Plan
1. **Fix root parser**
   - Update the rating-band parser so it handles the exact pasted block:
     - multiline Excel string
     - semicolons inside labels
     - Hindi text after ` / `
     - all scores `5,4,3,2,1,0`
   - Keep numeric score as `0..5`; store labels in `label_en` and `label_hi`.

2. **Use one parser everywhere**
   - Make the criteria-pack importer validate using the same parser instead of a loose regex-only check.
   - This prevents rows from being accepted when bands cannot actually be converted.

3. **Protect existing imported rows**
   - When an existing criterion key is re-imported, always overwrite `scoring_bands` with the newly parsed workbook bands.
   - Do not preserve old empty/generic bands when the workbook provides valid labels.

4. **Add regression tests**
   - Add a test for the exact `Attendance & Punctuality / उपस्थिति और समय की पाबंदी` sample.
   - Assert six bands are parsed and that score `5` and score `0` preserve both English and Hindi text.
   - Add/adjust criteria workbook tests so this format is accepted.

5. **Data repair check**
   - Query the backend for criteria with empty or default-looking scoring bands.
   - If rows are already polluted, prepare a safe one-time repair using re-imported workbook values or a guarded update for the affected criteria only.

## UI Changes
- **Location:** Annual Review Admin → Criteria import dialog.
- **Visual change:** Only clearer warning copy if a row lacks parseable scoring bands.
- **Interaction impact:** Same upload/import flow; fewer silent bad imports.
- **Responsiveness:** Not Applicable.

## Implementation
- Modify only annual-review criteria import/parsing files and tests.
- No database schema changes.
- Backend data repair only if inspection confirms polluted rows remain.

## Tests
- Unit test for exact pasted multiline rating block.
- Unit test for criteria workbook import preserving bilingual rating descriptions.
- Run targeted annual-review parser tests after implementation.

## DOCUMENTATION.md updates
- Add/update Annual Review import note: scoring bands must be parsed from workbook rating descriptions and must not fall back to generic labels when workbook labels exist.

## POLICY.md updates
- Add/update policy: imported criteria scoring labels are authoritative; generic 0–5 labels are only allowed for manually created criteria without imported bands.

## Post-implementation notes
- After approval, I will implement the parser fix first, then verify with tests and inspect existing backend rows for any remaining polluted scoring bands.