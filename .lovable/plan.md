## 1. Assumptions
- Atul Singh (200414) will submit through **My Annual Review** using his own employee login, as selected.
- The manager/team-assisted page must remain read-only for employees who have personal login access.

## 2. Clarifications
- Resolved: use direct employee submission; do not enable assisted submission for 200414.

## 3. RCA and 5 Why
**Confirmed current state**
- Employee: Atul Singh (200414), active, employee role, registered email.
- Instance `662da035…` is `pending_self`.
- Effective template is already the latest assigned **FAD- M - Mech v25**.
- The template contains five self-stage criteria, each with six valid options scored 5–0.
- There is no self-response row, submitted response, or response lock.

**Root cause:** The screenshot is from the **Team Annual Review assisted-submission page**, not Atul’s own **My Annual Review** page. The team page intentionally sets the matrix to read-only because Atul has personal login access.

1. Why can no option be selected? The option buttons receive `readOnly=true`.
2. Why is the form read-only? The viewer has no current reviewer/proxy role for Atul’s pending-self stage.
3. Why is proxy mode unavailable? Atul has personal login access.
4. Why did the earlier template refresh not fix it? Template reassignment and input authorization are separate concerns; the template was corrected, but the same assisted route was reopened.
5. Why was this mistaken for the earlier option-selection defect? Both show six unselectable-looking cards, but ADR-119 concerned score hydration; this case is an intentional route-level authorization lock.

## 4. Risk & Impact Report
- **Data impact:** No schema change and no reset. Existing template assignment, scores, and history remain untouched.
- **Workflow impact:** No permission change; Atul continues to own the self stage.
- **UI/UX impact:** Make the read-only assisted-page message more explicit about the required direct-login route, so users do not interpret disabled cards as a broken template.
- **Regression risk:** Low; confined to read-only guidance and regression coverage for route/lock resolution.
- **Scalability impact:** None; no new query or dataset loading.
- **Mitigation:** Add tests for the 200414-shaped pending-self/no-response case and preserve the existing proxy-login guard.
- **Rollback:** Revert the guidance/test changes; no database rollback required.

## 5. Step-by-step Plan
1. Add a regression fixture matching 200414: pending self, valid personal login, latest template, and no response lock.
2. Verify the direct employee surface resolves this state as editable and all six option cards emit score changes.
3. Verify the same instance remains read-only on the team-assisted surface.
4. Improve the read-only notice to explicitly state that the manager must not fill this form and that Atul must sign in and open **My Annual Review**.
5. Run the focused Annual Review routing, read-only notice, and scoring-matrix tests.
6. Re-check the live instance after implementation to confirm no reset or unintended data mutation occurred.

## 6. UI Changes
- **Location:** Team Annual Review → employee detail, above the disabled criteria.
- **Visual change:** Clearer “Assisted submission unavailable” guidance naming **My Annual Review** as the correct route.
- **Interaction:** No controls are enabled on the manager page; Atul’s own page remains editable.
- **Responsiveness:** Existing alert layout and mobile wrapping are preserved.

## 7. Implementation
- Surgical frontend clarification only; no permission bypass, template reset, or database mutation.

## 8. Tests
- Success: pending-self employee on **My Annual Review** can select each of the six score options.
- Failure/security: manager/team view cannot select those options when the employee has personal login access.
- Data fixture: include the effective-template and unlocked/no-response state that reproduces 200414’s case.

## 9. DOCUMENTATION.md Updates
- Add the confirmed RCA, distinction from ADR-119, corrective UX, validation, and rollback note to Version History.

## 10. POLICY.md Updates
- Clarify that template refresh does not override the personal-login assisted-submission guard and that direct employee submission is the required path.

## 11. Post-implementation Notes
- Atul should sign in with employee code **200414**, open **My Annual Review**, and select the options there. The Team Annual Review copy will clearly explain why that page remains read-only.