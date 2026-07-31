# ADR-223 — Make "which criteria are exemptable" admin-configurable

## What exists today
`public.annual_review_eligibility_exemption_policy` already holds the master list
(question_key, label, is_exemptable, requires_reason, notes) and is seeded with 7 rows:
Absent Days, LWP Days, Leave Without Pay (exemptable) and Disciplinary Action, Month
Completion Window, Months of Service, Service Tenure (not exemptable). Both the client
(`isExemptable`) and the DB trigger (`ar_eligibility_is_exemptable`) read it, and RLS already
allows Admin / HR PMS to write.

Gap: there is **no UI** — the list can only be changed with SQL. So the rule is effectively
hardcoded from the user's point of view.

## Where it should live (user-accessible)
**Annual Review → Admin → Settings tab**, as a new card directly under the existing
"Rating Slabs" card (`RatingSlabSettingsCard`). Same page HR/Admin already use for the other
increment master data, so exemption rules, rating slabs and the bell-curve cap sit together.
A "Manage exemption rules" shortcut link is also added to the Bell Curve tab header
(next to the existing cap note) and to `ExemptionDialog`, so an approver who hits
"not exemptable" can jump straight to the setting.

## UI: "Eligibility Exemption Rules" card
Table with one row per rule:

```text
Criterion (label)      Match key        Exemptable   Reason required   Notes        [x]
Absent Days            absent           [ ✔ ]        [ ✔ ]             ...          delete
Disciplinary Action    disciplinary     [   ] 🔒     [ ✔ ]             ...          delete
```

- Toggle **Exemptable** and **Reason required** inline; edit label / notes inline.
- **Add rule** row: label + match key (lowercased, trimmed) + toggles.
- Delete with the standard `ConfirmDestructiveDialog`.
- Match key is matched as a substring against the normalised criterion name, so the helper
  text spells this out and a live "matches N criteria in the active cycle template" hint is
  shown while typing.
- Protected rules (Disciplinary Action, tenure / month-completion) render with a lock icon and
  require an explicit "Unlock and allow exemption" confirmation before the toggle can be turned
  on, with the reason captured. This keeps ADR-221's default policy intact while still making
  it configurable, per this request.
- Read-only for non Admin / HR PMS (card shows the current rules, controls disabled).

## Database
Additive migration on `annual_review_eligibility_exemption_policy`:
- `is_protected boolean not null default false` — seeded true for the disciplinary / tenure /
  month-completion rows; drives the lock UI and an extra confirmation, not a hard block.
- `sort_order integer not null default 100` for stable display order.
- `updated_by uuid` + reuse of the existing `updated_at` trigger.
- New `annual_review_eligibility_policy_audit` table (rule id, question_key, before/after JSONB,
  action, changed_by, changed_at) written by a `BEFORE INSERT/UPDATE/DELETE` trigger, so every
  change to who can be exempted is traceable. GRANTs: select for authenticated, all for
  service_role; insert only via the SECURITY DEFINER trigger; RLS read restricted to
  Admin / HR PMS / Management.
- `ar_eligibility_is_exemptable()` is unchanged — it already reads the table, so server-side
  enforcement follows the new configuration automatically.

## Client changes
- `src/hooks/annualReview/useEligibilityExemptions.ts`: extend the policy query with the new
  columns and add `useSaveExemptionPolicy()` / `useDeleteExemptionPolicyRule()` mutations that
  invalidate `['ar-eligibility-exemption-policy']`.
- New `src/components/annual-review/EligibilityExemptionPolicyCard.tsx` (presentation only) and
  mount it in `AnnualReviewAdmin.tsx` Settings tab.
- `src/lib/annualReview/effectiveEligibility.ts`: add `validateExemptionPolicy(rows)` (non-empty
  label, non-empty unique key, key must be lowercase/normalised) used by the card before save.
  `isExemptable` logic itself is unchanged.
- `ExemptionDialog.tsx`: when a criterion is not exemptable, show the matched rule name and an
  admin-only link to the settings card instead of a bare "not exemptable" message.

## Documentation & tests
- New **ADR-223**, update **POLICY §AR-ELIGIBILITY-EXEMPTION** (rules are master data, protected
  rows need an explicit unlock, all edits audited), DOCUMENTATION.md version history.
- Tests in `src/test/annualReview/effectiveEligibility.test.ts`: `validateExemptionPolicy`
  happy/failure cases; `isExemptable` after flipping a protected rule on; duplicate-key rejection;
  fail-closed when no rule matches (existing behaviour re-asserted).

## Risk & impact
- **Data:** additive columns + one audit table; no existing rows mutated. Rollback = drop the
  two columns, the audit table and the new card.
- **Workflow:** turning a rule on/off changes which future exemption requests the DB trigger
  accepts. Already-approved exemptions are untouched, but if a rule is turned **off**, existing
  approved exemptions for it stop waiving the failure (employee returns to Ineligible) — the card
  warns with the affected count before saving.
- **UI/UX:** one new card on an existing tab; no navigation change.
- **Regression:** low — `isExemptable` and the DB function keep their signatures.
- **Scalability:** table is <20 rows; single cached query.
