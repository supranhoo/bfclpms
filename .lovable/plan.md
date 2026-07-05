## 1. Assumptions
- The required Excel format is exactly like your screenshot: column A = `Criteria`, column B = `Rating - Discription`, and the full 5-to-0 explanation is inside one multiline cell.
- The app must use the Excel cell content as the reviewer-facing labels, not the generic `Outstanding / Above target / ...` ladder.
- Existing generic rows in the Criteria Library should be overwritten when the Excel row has valid 5-to-0 descriptions.

## 2. Clarifications
Not Applicable — the requirement is clear. This mapping is possible and should not need manual entry if the Excel cell contains the score lines.

## 3. Risk & Impact Report
- **Data Impact:** Updates existing Criteria Library `scoring_bands` values where Excel provides valid score descriptions. No schema change needed.
- **Workflow Impact:** Import flow remains the same, but it will stop silently accepting generic/default ladders when Excel contains real labels.
- **UI/UX Impact:** Edit dialog and reviewer scoring buttons will show the actual long English/Hindi descriptions per score.
- **Regression Risk:** Medium, because importer currently handles more than one BFCL workbook shape. I will preserve existing section-aware behavior while adding support for the simple two-column sheet shape shown in your screenshot.
- **Scalability Impact:** Low. Parsing is local to the uploaded workbook; no large dataset query changes. Existing list pagination patterns remain unchanged.
- **Mitigation Plan:** Add parser tests for the exact screenshot layout, conversion tests for label propagation, and a targeted data-repair step for rows currently stuck on default/generic ladders.

## 4. Step-by-step Plan
1. **Fix the workbook parser mapping**
   - Detect both workbook shapes:
     - Sectioned BFCL form: `Type → Criteria → Rating - Discription → Wt%`
     - Simple criteria pack: `Criteria → Rating - Discription`
   - For every row, map:
     ```text
     Criteria cell
       -> label_en / label_hi

     Rating - Discription cell
       -> scoring_bands[]
          5 -> label_en + label_hi
          4 -> label_en + label_hi
          3 -> label_en + label_hi
          2 -> label_en + label_hi
          1 -> label_en + label_hi
          0 -> label_en + label_hi
     ```
   - Treat line breaks, carriage returns, `_x000D_`, and wrapped Excel text as equivalent.

2. **Make rating extraction stricter and safer**
   - Parse by score markers (`5 -`, `4 -`, `3 -`, `2 -`, `1 -`, `0 -`) instead of relying only on line splitting.
   - This handles cases where Excel stores the full description as one wrapped string.
   - Preserve semicolons inside labels; do not split on semicolons.
   - Split English/Hindi only on the bilingual separator ` / `.

3. **Prevent default ladder from hiding import failures**
   - In the import flow, require valid parsed bands before saving `scoring_bands`.
   - If the workbook row has a rating cell but fewer than expected score bands, show a warning with the criterion name.
   - Do not overwrite a valid Excel ladder with defaults.

4. **Repair existing generic data**
   - After parser fix, re-import should overwrite existing generic/default bands.
   - Add a targeted cleanup/repair path for criteria whose key already exists but still has default labels like `Outstanding`, `Above target`, etc.
   - This will repair rows like `attendance_punctuality` without requiring manual recreation.

5. **Verify template propagation**
   - Ensure Criteria Library `scoring_bands` flows into generated templates through `bandsToBilingualOptions`.
   - Confirm reviewer screen buttons display the Excel labels, not generic labels.

## 5. UI Changes
- **Criteria Library edit dialog:** The Rating labels table should show the Excel descriptions per score.
  - Example score 5 EN: `Always on time; zero unexcused absence; supports reliable shift continuity.`
  - Example score 5 HI: `हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं; शिफ्ट निरंतरता में सहयोग करता है।`
- **Reviewer criteria scoring cards:** Score buttons should show these same imported labels.
- **Import feedback:** Add a clearer warning if any row cannot be parsed into rating bands.
- **Responsiveness:** Long labels remain in existing table/card layouts with wrapping; no new wide layout required.

## 6. Implementation
- Update `parseBandsBlock` to segment the rating description by score markers, not just by line breaks.
- Update `parseCriteriaPackWorkbook` to support the two-column layout from your screenshot and the existing sectioned BFCL layout.
- Update import commit logic to overwrite generic/default `scoring_bands` when valid Excel bands are present.
- Keep changes surgical: no schema refactor, no new workflow, no manual template system rollback.

## 7. Tests
- Add/adjust unit tests for:
  - Exact screenshot-style row: `Criteria` + `Rating - Discription` with all six scores in one cell.
  - Multiline CR/LF/_x000D_ variants.
  - Semicolon-heavy English/Hindi descriptions.
  - Existing generic ladder replaced by parsed Excel labels.
  - Template option conversion carries `label_hi` into reviewer UI.

## 8. DOCUMENTATION.md updates
- Document the Criteria Library Excel import contract:
  - Criteria column maps to criterion name.
  - Rating description column maps to 0-to-5 scoring bands.
  - Generic ladder is fallback only when no imported bands exist.

## 9. POLICY.md updates
- Add/clarify annual-review policy: imported qualitative criteria must preserve reviewer-facing score definitions from the approved Excel pack; generic 0-to-5 labels are not acceptable when Excel definitions exist.

## 10. Post-implementation notes
- Rollback strategy: revert parser/import changes; no destructive schema migration is planned.
- Data repair will be targeted and reversible by re-importing the approved Excel pack again.
- Expected outcome: you should not have to manually enter the 0-to-5 labels if the Excel sheet contains them in the shown format.