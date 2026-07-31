---
name: Annual Review Eligibility Exemptions
description: ADR-221 effective eligibility resolver, exemptable-question master policy, exemption approval workflow in the Bell Curve drill-down
type: feature
---
ADR-221 / POLICY §AR-ELIGIBILITY-EXEMPTION.
- SSOT: `src/lib/annualReview/effectiveEligibility.ts` — `resolveEligibility()` → `eligible | exempted | ineligible | unknown`. Reuses the ADR-181 evaluator; never duplicate operator logic.
- Exemptable questions are master data in `annual_review_eligibility_exemption_policy` (substring match on the normalised question name). Never hardcode which criteria are exemptable. No matching row ⇒ NOT exemptable (fail closed).
- Absent days / LWP are exemptable; disciplinary action and the 6-month / service-tenure window are never exemptable — enforced both client-side and by `ar_elig_exemption_guard()`.
- Exemptions live in `annual_review_eligibility_exemptions` (unique per instance+criterion). Approve/reject/revoke: admin, hr_pms, management only. Self-approval blocked (except admin).
- Ineligible ⇒ displayed increment slab is 0% (`effectiveSlabPercent`); rating bands and bell-curve distribution are untouched.
- UI: Eligibility filter + Ineligible KPI in `BellCurveTab.tsx`; badge column, CSV column and `ExemptionDialog` in `bellCurve/BandEmployeeList.tsx`.