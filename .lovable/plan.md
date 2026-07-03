# RCA — April Org KPIs re-appearing on Auditor dashboard

Read-only investigation. No code change proposed yet; end of the report lists options for you to choose from.

## 1. Scope of what Shekhar Sharad is seeing

The four KPIs behind the complaint (all Org KPI "Closure of Audit Observations / Compliance to CLC norm", review_period = April 2026) are:

| Employee | KPI id | Current status | self / mgr / audit / mgmt |
|---|---|---|---|
| Jitendra Kumar Dwivedi | 6a1ba417… | `audit` | 5 / — / 5 / — |
| Sajid Raza | 6175ad7f… | `audit` | 5 / — / 5 / — |
| V.A.V.S.S. Ganapathi Varma | 9a83b12f… | `audit` | 5 / 5 / 5 / — |
| Parshu Ram Shukla | 4abc79e0… | `audit` | 5 / — / 5 / — |

`status = audit` means the auditor stage is **already marked complete** (convention: status = last completed stage). Next expected owner is Management. Manager / Skip‑Level stages were **skipped** (no manager_score on 3 of 4).

The other 28 April CLC-norm rows are already `approved` — those went through the normal path in April/May and are fine.

## 2. What the audit trail actually shows

Full `kpi_audit_logs` for Parshu Ram Shukla's row (identical shape for the other three):

```
2026-04-01 12:17  row created, status = kra_set        (system)
   … 86 days of nothing …
2026-06-26 08:51  ORG_KPI_VALUE_OVERWRITTEN
                   overwrite_policy = overwrite_and_stepback
                   achieved=5, new_self_score=5, new_status=self_review
                   prior_status=kra_set                (Vivek Kumar Dansena, 101784)
2026-06-26 08:51  ORG_KPI_PROPAGATED                  (Vivek)
2026-06-26 09:13  ADMIN_DATA_ENTRY_SELF
                   reason = "KPI is being forwarded to the Audit Team,
                             as the KRA was not reviewed within the defined timeline."
                   fields = achieved_value, self_rating, self_score,
                            self_remarks, self_evidence_urls, is_na  (Vivek)
2026-07-02 13:26  SUBMISSION_SCORE_CHANGED (safety_net_trigger)   (Ayush Bansal)
2026-07-02 13:26  BULK_STAGE_SIGNOFF_AUDITOR
                   batch_reason = "okay as per audit review policy:
                                   §88.1.d / ADR-098"              (Ayush)
2026-07-02 13:40  STATUS_TRANSITION → audit                        (Ayush)
2026-07-02 13:40  AUDITOR_REVIEWED                                 (Ayush)
```

Two facts from this log:

- **Shekhar's observation "no history before 26 Jun" is literally true.** These four rows were dormant in `kra_set` for 86 days — nobody self-reviewed in April, no manager acted, no auditor acted. There is nothing to display before 26 Jun because nothing happened.
- **The auditor stage was signed off by Ayush Bansal (Auditor003), not by Shekhar.** Level assignment (`audit_kpi_level_assignments`) confirms three of the four rows are assigned to Ayush; none are assigned to Shekhar. So "already reviewed and completed" from Shekhar's perspective is a misread — his team never reviewed them. Ayush bulk‑closed them on 2 Jul under the §88.1.d safety-net policy.

## 3. Root cause chain

Two admin escalation levers fired one after the other on already-lapsed April rows:

1. **ADR‑053 `overwrite_and_stepback` propagation** (Data Owner Vivek, 26 Jun 14:21 IST): allowed the Org-KPI master value entered 86 days late to be pushed into rows still in `kra_set`, materialising a synthetic self-review (score = 5) without the employee touching the form.
2. **Admin Data Entry (self) forward-to-audit** (Vivek, 26 Jun 14:43 IST): the "not reviewed within timeline" dialog jumped the KPI directly from `self_review` to the auditor queue, bypassing Manager and Skip-Level entirely. That is why manager_score is null.
3. **ADR‑098 §88.1.d Bulk Auditor Sign-off** (Ayush, 2 Jul 18:54–19:10 IST): bulk-closed the auditor stage on the four rows the same day they surfaced in Ayush's queue.

Net effect on Shekhar's dashboard: rows appear under "My Assignments" because the auditor role sees any auditor-linked KPI still short of Management approval; and because Manager/Skip-Level were skipped, the workflow tile lights the Audit node even though `status = audit` already. That looks like a fresh, unreviewed KPI to a human reader — hence the complaint.

## 4. What is genuinely wrong vs. working as designed

Working as designed:
- `overwrite_and_stepback` back-fill and the ADR-098 bulk auditor sign-off both did exactly what their policies allow. Every step is audit-logged with performer + reason.
- Empty timeline before 26 Jun is correct — no earlier events existed.

Genuinely problematic:
- **Manager & Skip-Level were silently skipped.** The `ADMIN_DATA_ENTRY_SELF` path advanced status past `manager_check`/`skip_check` without ever creating a manager review; `manager_score` is NULL on 3 of 4 rows. This is invisible on the mobile workflow strip because the strip only reads `status`, not per-stage scores, so all prior nodes render green.
- **Cross-auditor visibility.** Rows level-assigned to Ayush surface in Shekhar's "My Assignments" list. Either the assignment routing is missing a filter, or Shekhar is the fallback auditor for the affected employees. This is what makes the complaint sound like a regression.
- **No stale-period guard.** A 3-month-old April review can still be back-filled and force-forwarded end-to-June/July without any explicit reopen action or override note visible in the reviewer UI.

## 5. Regression? — No

There is no code change on those rows outside the two documented admin actions. The system did not resurrect approved data. The rows were never approved in the first place; they were force-advanced from `kra_set` to `audit` in one day via legitimate admin tools.

## 6. Options (choose one or more, I'll follow up with a build plan)

- **A. Communicate only.** Reply to Shekhar with the timeline above; no code change.
- **B. UX guard.** Render an amber banner on any KPI whose `manager_score` / `skip_score` is NULL but `status ≥ audit`, labelled "Stages skipped via Admin Data Entry — see timeline". Purely visual; no data change.
- **C. Assignment scope fix.** Restrict "My Assignments" for auditors to KPIs where they appear in `audit_kpi_level_assignments` / `audit_kpi_assignments`. Needs a rule confirmation from you (should Shekhar see Ayush's rows at all?).
- **D. Policy tightening.** Require an explicit "reopen past period" confirmation in the Org KPI Data Entry dialog when `review_period` is older than the current review window, and force `overwrite_and_stepback` to log a reason string.

## 7. Not applicable in this pass

Code edits, migrations, tests. This is a diagnostic report only, per plan mode.
