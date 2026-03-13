

# Confirming Behaviour & Plan Impact

## 1. How Final Score Works Today

**Yes, the final score is the score given at the last stage.** Specifically:

- When **Management** (the terminal reviewer) approves a KPI, `ManagementScorecard.tsx` writes `final_score = management_score` and `final_rating = management_rating` into `review_submissions`.
- The **Dashboard** and all reports use a fallback chain: `final_score ?? management_score ?? auditor_score ?? hr_pms_score ?? skip_level_score ?? manager_score ?? self_score ?? 0`. This means the last reviewer's score always takes precedence.

So for Anil Kumar Pathak's KPI: Gaurav (Management) gave score **0** → `final_score = 0` → Dashboard correctly shows **0**. This is working as intended.

## 2. Will The Plan Change Any Scoring Rules?

**No. The plan changes ZERO scoring rules or KPI logic.** Here is exactly what it touches:

| Change | What it does | Affects scoring? |
|--------|-------------|-----------------|
| Swap priority in `KpiJourneySection.tsx` | Display fix only — shows `storedScore` (the actual DB value) instead of a recalculated value in the **View KPI Details** panel | **No** — this is a read-only display component. It does not write to the database. |
| Remove achieved-value fallback in `ManagementScorecard` / `AuditScorecard` | Stops pre-filling the achieved value field from a previous stage's value when opening the review sheet | **No** — reviewers can still enter any achieved value they want. It only changes the **initial pre-fill** so stale values don't get accidentally saved. The reviewer's actual submission logic is unchanged. |

**In summary:**
- The fallback chain (`final_score ?? management_score ?? ...`) is untouched
- The `calculateRating` scoring engine is untouched  
- The approval flow that writes `final_score` / `final_rating` is untouched
- KPI thresholds (r0–r5), criteria, weightages — all untouched
- This is purely a **display fix** for the Journey panel showing wrong numbers

