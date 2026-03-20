
## Completed: Query Feature End-to-End Repairs (v1.57.0)

All 5 fixes implemented and deployed:

1. ✅ RLS policy added for `raised_by` to UPDATE `kpi_queries` (Accept Response fix)
2. ✅ Evidence upload added to Raise Query dialogs in both UnifiedScorecard and EmployeeScorecard
3. ✅ Notifications inserted on query raise, respond, and accept actions
4. ✅ Raise Query expanded to all reviewer roles (manager, auditor, skip_level, hr_pms, management)
5. ✅ Inline respond-to-query section added to SelfReviewSheet

v1.57.0: Added missing notification insert in `useRaiseQuery` so the recipient is alerted when a query is raised.
