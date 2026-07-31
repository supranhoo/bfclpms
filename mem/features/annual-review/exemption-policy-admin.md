---
name: Exemption Criteria Admin Configuration
description: Which eligibility criteria are exemptable is admin master data (ADR-223) managed in Annual Review → Admin → Settings
type: feature
---
Exemptable criteria live in `public.annual_review_eligibility_exemption_policy` and are
managed from **Annual Review → Admin → Settings → Eligibility Exemption Rules**
(`EligibilityExemptionPolicyCard`, Admin / HR PMS only). Never hardcode the absent/LWP list.

- `question_key` is matched as a normalised lower-case substring of the criterion name.
- `is_protected` rows (disciplinary, tenure, month completion) need an explicit UI unlock
  before `is_exemptable` can be toggled; `ar_elig_exemption_guard()` stays the server authority.
- Client validation: `validateExemptionPolicy()` in `src/lib/annualReview/effectiveEligibility.ts`.
- All rule changes are audited in `annual_review_eligibility_policy_audit`.

See ADR-223 / POLICY §AR-ELIGIBILITY-EXEMPTION item 7.