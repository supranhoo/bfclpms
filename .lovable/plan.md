## Problem (RCA)

On 7-May Vivek submitted his self-review for "Adherence to Manning Norms" with achieved value **and** a supporting file. His Employee front shows it. Admin → Org KPI Data Entry → this KPI's per-employee row shows only the **value** (sometimes), and the **Supporting file** + **Remarks** are blank.

### Root cause

In `src/pages/admin/OrgKpiDataEntry.tsx` (`buildCardData`, employee-scope branch, lines ~587–656) each scoped row is built from the OKV row only:

```ts
remarks:      val?.remarks      ?? '',
evidenceUrl:  val?.evidence_url ?? null,
achievedValue: fallbackAchieved  // ← only this has a submission fallback
```

`val` is the `org_kpi_values` row keyed by `(category, kra, kpi, employee_id=empId)`. When an employee enters data via Self-Review, the value lives on **`review_submissions`** (`achieved_value`, `self_remarks`, `self_evidence_url`, `self_evidence_urls`), not on `org_kpi_values`. The admin page already has a partial submission fallback (`useOrgKpiSubmissionFallback`) but it only carries `achievedValue` + `isNa`. Remarks and evidence are never read back, so the admin grid looks "empty" even though the data exists.

Parity is one-directional today: Admin → Employee works (propagation pushes OKV → review_submissions). Employee → Admin breaks for remarks & evidence.

## Risk & Impact Report

- **Data Impact:** Read-only. No schema, RLS, or historical-data changes. Existing OKV rows continue to win when present (no regression on admin-entered data).
- **Workflow Impact:** None. Admin still saves to OKV; employees still submit to review_submissions. We only add a display fallback.
- **UI/UX:** Admin per-employee row now shows remarks + paperclip/upload state when the employee already provided them. Save flow unchanged — if admin uploads/edits, OKV continues to be the source of truth.
- **Regression Risk:** Low. Fallback is applied **only when the OKV row is missing or empty for that field**, mirroring the existing `okvHasValue` pattern already used for `achievedValue`.
- **Mitigation:** New unit tests for `useOrgKpiSubmissionFallback` covering remarks/evidence; new test for the row-build precedence (`OKV present → OKV wins`, `OKV empty → submission wins`, `both empty → blank`).

## Plan

### 1. Extend the submission fallback hook
`src/hooks/useOrgKpiSubmissionFallback.ts`
- Expand the select to: `kpi_id, achieved_value, is_na, self_remarks, self_evidence_url, self_evidence_urls`.
- Extend `SubmissionFallbackEntry` with `selfRemarks: string | null` and `selfEvidenceUrls: string[]` (always an array — `[self_evidence_url]` when only the singular is set).
- Per-employee `map.set(\`${defKey}||${employeeId}\`, …)` now carries those two extra fields. Dept/Org aggregate buckets are unchanged (those scopes only need value/NA — admin always owns evidence at those scopes).

### 2. Use the fallback in the employee-scope scoped-row builder
`src/pages/admin/OrgKpiDataEntry.tsx` (`buildCardData`, employee branch ~lines 587–655)
- Add field-level fallback (same pattern as `achievedValue`):
  ```ts
  const okvHasRemark   = !!(val?.remarks && val.remarks.trim());
  const okvHasEvidence = !!val?.evidence_url
                      || (Array.isArray(val?.evidence_urls) && val!.evidence_urls.length > 0);

  const effRemarks     = okvHasRemark   ? val!.remarks : (fb?.selfRemarks ?? '');
  const effEvidenceUrl = okvHasEvidence ? (val?.evidence_url ?? (val?.evidence_urls?.[0] ?? null))
                                        : (fb?.selfEvidenceUrls?.[0] ?? null);
  ```
- Replace the two lines in the returned scoped row:
  - `remarks: effRemarks`
  - `evidenceUrl: effEvidenceUrl`
- No change to `status`, `okvId`, or save handlers (admin save still writes OKV; the data simply surfaces in the meantime).

### 3. Reverse parity (Admin → Employee) — verify only, no code
Already handled by `usePropagateOrgKpiValue` / `resync_org_kpi_evidence`. We will add one regression test that confirms an OKV value+evidence propagates onto the employee `review_submissions` row, so the existing direction never silently breaks.

### 4. Tests (Mandatory)
New files:
- `src/test/orgKpiSubmissionFallback.evidence.test.ts` — fallback returns `selfRemarks` and `selfEvidenceUrls` from `review_submissions` (singular + plural columns; plural wins when both present).
- `src/test/orgKpiScopedRowSubmissionFallback.test.ts` — for one mapped employee:
  - OKV row missing → row shows submission's value, remarks, evidence.
  - OKV row has only value (admin entered number, no remarks/evidence) → admin's value wins; remarks/evidence come from submission.
  - OKV row has remarks+evidence → OKV wins entirely (no regression).
  - Reverse: OKV with value+evidence after propagate → employee `review_submissions` row has the same `achieved_value` and merged `evidence_urls` (guard for the Admin → Employee direction).

### 5. Documentation & Policy sync (SSOT)
- `DOCUMENTATION.md` — under "Org KPI Data Entry / Read-model" add a row to the precedence table:
  `remarks` and `evidenceUrl` resolution: `OKV (non-empty) → review_submissions.self_remarks / self_evidence_urls[0] → blank`.
- `POLICY.md` — under "Org KPI parity" restate the two-way rule: *"Whatever an employee sees on their Self-Review for an Org KPI must be visible on the admin Org KPI Data Entry row for that employee, and vice-versa. OKV is the source of truth when present; otherwise the employee's submission is surfaced."*
- Append a `Version History` entry: *"2026-05-19 — Extended Org KPI admin grid to read self-submitted remarks & supporting files from review_submissions when OKV is empty (Employee → Admin parity fix; RCA Vivek / Adherence to Manning Norms, 7-May)."*

## Verification steps after implementation

1. Reopen the same KPI card for May 2026; Vivek's row should now show his achieved value, his remark text, and a paperclip linking his uploaded file.
2. Switch to a KPI where admin already entered evidence — admin's evidence still shown (no regression).
3. Re-run the new test files; all green.

## Technical notes (admin reference)

- No DB migration required. Read uses existing RLS on `kpis` and `review_submissions` already used by `useOrgKpiSubmissionFallback`.
- `evidence_urls` (plural) is preferred over the singular column when both are present, matching the `multi-file-evidence-storage` memory.
- We intentionally do not write the employee's evidence into OKV automatically — that would blur ownership and bypass governance. Admin still chooses Save / Save & Propagate explicitly; the new fallback is display-only until then.

