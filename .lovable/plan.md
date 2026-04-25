## Implemented — TNI Detection Splits Compliance vs Skill Gaps (BUG-025, v2.66.7.27)

- Enum `tni_gap_type` extended with `'compliance'`.
- `detect_training_needs_for_period` now runs Pass A (compliance — `self_score IS NULL` OR `auto_advance_reason IS NOT NULL`) and Pass B (skill — submitted but low). Both keep the `NOT EXISTS` dedup.
- `useTNI.ts`: gap_type added to type union; `useTNISummary` returns `complianceGaps` separately and `total` excludes compliance; `useTrainingNeeds` accepts `gapType` filter.
- `TNIReport.tsx`: new "Compliance Gaps" card (amber), "Training Needs (Skill Gaps)" card excludes compliance, Gap Type filter (All / Training / Compliance) on Individual tab, Gap Type badge column.
- Tests: BUG-025 (5 assertions) — all passing.
- Docs: DOCUMENTATION.md v2.66.7.27 entry; POLICY.md §98.
- LMS handoff: `gap_type='skill'` rows are training-eligible; compliance rows are visibility-only.
