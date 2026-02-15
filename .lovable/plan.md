

# Unified Rating Color System with Severity Gradient

## Summary

Create a centralized `RatingBadge` component and a single-source-of-truth rating utility system in `reviewConstants.ts`. The key change from the previous plan: scores 0, 1, and 2 now use a **three-tier red severity gradient** instead of a single red color, giving visual distinction to different levels of underperformance.

## Canonical Rating Scale

| Score | Label | Hex Color | Badge BG Class | Text Color | Severity |
|---|---|---|---|---|---|
| 5 | Outstanding | #3B82F6 | bg-blue-100 | text-blue-800 | -- |
| 4 | Exceeds Expectations | #10B981 | bg-green-100 | text-green-800 | -- |
| 3 | Meets Expectations | #F59E0B | bg-yellow-100 | text-yellow-800 | -- |
| 2 | Needs Improvement | #FECACA (Light Pink) | bg-red-100 | text-red-700 | Soft Warning |
| 1 | Below Expectations | #EF4444 (Bright Red) | bg-red-400 | text-white | Active Failure |
| 0 | Not Achieved | #7F1D1D (Deep Maroon) | bg-red-900 | text-red-100 | Critical Void |

**Important constraint**: The database `rating_level` enum remains `'red' | 'yellow' | 'green' | 'blue'`. Scores 0, 1, and 2 all map to `'red'` at the database level. The severity gradient is purely a UI-layer distinction based on the numeric score.

---

## Before / Changes / After

### Before
- 15+ files each define their own `getRatingColor`, `getScoreBadgeClass`, `ratingColors`, `ratingLabels`, and `getScoreLabel` locally
- Scores 0, 1, and 2 all render identically (same red shade) -- no visual distinction between "Needs Improvement" and "Not Achieved"
- `ratingToLevel()` maps score 4 to blue (wrong -- should be green)
- `levelToText()` labels green as "Meets" and yellow as "Below" (swapped)
- `ratingOptions` array only covers scores 2-5 (no entries for 0 or 1)
- No reusable `RatingBadge` component

### Changes
1. Create `src/components/ui/RatingBadge.tsx` -- a reusable component that accepts a numeric score (0-5) and renders the correct color/label automatically
2. Expand `reviewConstants.ts` to be the single source of truth with:
   - `RATING_SCALE` (full 0-5 definitions with hex, badge classes, labels)
   - `getScoreColor(score)` -- returns hex color
   - `getScoreBadgeClass(score)` -- returns Tailwind badge classes
   - `getScoreLabel(score)` -- returns label string
   - `scoreToRatingLevel(score)` -- returns DB-level enum
   - Updated `ratingOptions` to include all 6 levels
3. Fix `ratingCalculation.ts`: correct `ratingToLevel()` (4 -> green) and `levelToText()` labels
4. Replace all 15+ local duplicates with imports from `reviewConstants.ts` or usage of `RatingBadge`
5. Update `pdfExport.ts` color maps with the severity gradient for PDF reports

### After
- **Score 5** badge: Blue background, white text, "Outstanding"
- **Score 4** badge: Green background, white text, "Exceeds Expectations"
- **Score 3** badge: Yellow/Amber background, dark text, "Meets Expectations"
- **Score 2** badge: Light pink background (#FECACA), dark red text, "Needs Improvement" -- visually soft, coaching tone
- **Score 1** badge: Bright red background (#EF4444), white text, "Below Expectations" -- urgent danger signal
- **Score 0** badge: Deep maroon background (#7F1D1D), light text, "Not Achieved" -- darkest, most severe

All components across the app (scorecards, review trails, tracker modals, scoring simulator, PDF exports) will render identical colors for the same score.

---

## New Component: RatingBadge

```text
<RatingBadge score={5} />        -->  [Blue]  "5 - Outstanding"
<RatingBadge score={2} />        -->  [Pink]  "2 - Needs Improvement"
<RatingBadge score={0} />        -->  [Maroon] "0 - Not Achieved"
<RatingBadge score={null} />     -->  [Gray]  "Not Set"
<RatingBadge score={3} short />  -->  [Yellow] "3 - Meets"
```

Props: `score: number | null`, `short?: boolean` (abbreviated label), `className?: string`

---

## Files to Modify

### New Files
| File | Purpose |
|---|---|
| `src/components/ui/RatingBadge.tsx` | Reusable badge component with severity gradient |

### Core Logic Updates
| File | Change |
|---|---|
| `src/lib/reviewConstants.ts` | Add full 0-5 `RATING_SCALE`, centralized utility functions (`getScoreColor`, `getScoreBadgeClass`, `getScoreLabel`, `scoreToRatingLevel`), update `ratingOptions` |
| `src/lib/ratingCalculation.ts` | Fix `ratingToLevel()` (4 -> green not blue), fix `levelToText()` labels |
| `src/lib/ratingCalculation.test.ts` | Update expected values for corrected functions |
| `src/lib/qualitativeUom.ts` | Import `scoreToRatingLevel` from reviewConstants instead of local definition, update `RATING_LABELS` to match canonical labels |

### Scorecard Components (remove local `getScoreBadgeClass` + `getScoreLabel`)
| File | Change |
|---|---|
| `src/components/review/EmployeeScorecard.tsx` | Import centralized functions |
| `src/components/review/AuditScorecard.tsx` | Import centralized functions |
| `src/components/review/ManagementScorecard.tsx` | Import centralized functions |
| `src/components/review/UnifiedScorecard.tsx` | Import centralized functions |

### Review UI Components (remove local `ratingColors`, `ratingLabels`, `getRatingColor`)
| File | Change |
|---|---|
| `src/components/review/AchievedValueScoreInput.tsx` | Import from reviewConstants |
| `src/components/review/QualitativeValueInput.tsx` | Import from reviewConstants |
| `src/components/review/QualitativeSelect.tsx` | Import from reviewConstants |
| `src/components/review/RatingSelector.tsx` | Import from reviewConstants |
| `src/components/review/ScoreSelector.tsx` | Import from reviewConstants |
| `src/components/review/ReviewTrailCard.tsx` | Import from reviewConstants |
| `src/components/review/ReviewTrailCardCompact.tsx` | Import from reviewConstants |
| `src/components/review/ReviewStageCard.tsx` | Import from reviewConstants |
| `src/components/review/PreviousLevelRemarks.tsx` | Import centralized functions |
| `src/components/review/ReviewLevelOverrideEditor.tsx` | Import centralized functions |
| `src/components/review/ManagerDailyOverrideEditor.tsx` | Import centralized functions |
| `src/components/review/RatingScaleDisplay.tsx` | Align labels with canonical scale |

### Dashboard and Admin Components
| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Import `ratingColors` from reviewConstants |
| `src/components/dashboard/KpiTrackerModal.tsx` | Import centralized `getRatingColor` |
| `src/components/dashboard/MobileKpiCard.tsx` | Use centralized color map |
| `src/components/admin/ScoringSimulatorPopover.tsx` | Import centralized functions |
| `src/components/dashboard/KpiLogicModal.tsx` | Import centralized `ratingColors` |

### PDF Export
| File | Change |
|---|---|
| `src/lib/pdfExport.ts` | Update `COLORS`, `getRatingColor`, `getRatingLightColor`, `getScoreColor` to include maroon for score 0 and pink for score 2 |

### Documentation
| File | Change |
|---|---|
| `DOCUMENTATION.md` | Document canonical rating scale with severity gradient |

## Risk Assessment
- The `RatingLevel` database enum (`red | yellow | green | blue`) is NOT modified -- scores 0, 1, 2 all remain `red` at the DB layer
- All changes are UI-only refactoring with the severity gradient being a pure visual enhancement
- The `ratingToLevel` and `levelToText` bug fixes correct two existing mismatches that could cause confusion in the Scoring Simulator
- Backward compatible -- no database or API changes required

