
## Fix: KPI Tracker Sheet graph should plot Final values, not Self

### Context
In `src/components/dashboard/KpiTrackerModal.tsx`, the "Annual Performance Trend" line chart plots:
- `target` (KPI target)
- `achieved` → comes from `sub.achieved_value`, which is the **self-entered** achieved value

User expects the graph to reflect the **Final** values (what was approved at terminal stage), so the trend matches the authoritative score, not the self-submitted raw entry.

### Root cause
The chart uses raw `achieved_value` (always set by self-review). Per `mem://architecture/pms/universal-scoring-logic` and `mem://features/review/final-score-governance-and-immutability`, the authoritative value is the highest-stage submitted value:
- **Achieved**: prefer `management_achieved_value → auditor_achieved_value → hr_pms_achieved_value → skip_level_achieved_value → manager_achieved_value → achieved_value (self)`
- **Score**: `final_score` once approved; otherwise the 8-stage fallback chain

### Change
1. In `KpiTrackerModal.tsx`, build two new derived fields per period:
   - `finalAchieved` — fallback chain across stage-specific achieved-value columns (Mgmt → Auditor → HR PMS → Skip → Manager → Self).
   - `finalScoreForChart` — `final_score` if approved, else 8-stage fallback (already imported pattern from `useEmployeeScoresForPeriod.ts`).
2. Update the `<LineChart>`:
   - Keep `Target` line (dashed grey).
   - Replace `achieved` line with **`finalAchieved`** (renamed to "Achieved (Final)") — primary solid line.
   - Add an optional **`finalScoreForChart`** line ("Final Score", secondary axis or different color) — small enhancement so the user sees both achievement and score progression. *(Confirm in implementation if user wants score line too; default = just achieved-final.)*
3. Tooltip + Legend labels updated to reflect "Final" sourcing.
4. N/A periods continue to render as `null` (line gap).

### Files Touched
- `src/components/dashboard/KpiTrackerModal.tsx` — extend `MonthEntry`, add fallback helpers, swap chart `dataKey`.
- `DOCUMENTATION.md` — Version History note.
- Memory: small update to `mem://features/user/profile-management` or new note under `mem://features/review/` if relevant — likely just a one-line note; not creating a new file.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Read-only derivation from existing submission columns. |
| Workflow | None. |
| UI | Trend line now matches authoritative final values — consistent with scorecard and reports. |
| Regression | Very low. Table columns (Self/Manager/.../Final) are untouched; only the chart's "Achieved" series source changes. |
| Mitigation | Null-safe fallback chain. Periods with only self-data still plot (falls through to self). Verify with: (a) approved KPI, (b) in-progress KPI (only self/manager filled), (c) N/A period. |

### Out of Scope
- Restyling the chart or adding score-axis unless requested.
- Changing the Monthly Detail table — it already shows per-stage scores plus Final correctly.
