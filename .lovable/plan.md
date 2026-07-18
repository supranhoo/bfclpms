## Investigation-first RCA — "Employee still sees the old template after HR changed it"

### Findings from live DB (evidence)

| Emp | Instance | `template_id` | `template_override_id` | Effective | Audit says |
|---|---|---|---|---|---|
| **100846** Prince Kumar | 3c1cff8e… | `316a9249` (CPP-W-E&I) | **NULL** | CPP-W-E&I | **No `template_override_set` / `instance_force_reset` ever recorded.** Instance is already `pending_dept` (self submitted 17-Jul, 10 criteria scored). |
| **100357** Nikunj | 422f7062… | `a6e88cd5` (Generic M – With KRA) | `0a815c39` (Without KRA) | Without KRA | 03:44 force-reset → template_id `0a815c39`; 08:49 override set to `0a815c39`. **But current `template_id` is back to `a6e88cd5`** — something rewrote it after the reset. |
| **101762** Kanha Modi | ff6292b0… | `a6e88cd5` | `0a815c39` | Without KRA | Same pattern as 100357. |

Two distinct symptoms, one shared symptom-cause hypothesis:

- **100846**: HR's "template change" never landed on the instance row (no audit, no override). The user's memory of changing it doesn't match DB reality — likely the wrong screen was used (e.g. assignment rule / archetype template) and, because the instance is already submitted, no re-seed touched it.
- **100357 / 101762**: Override IS set to the new template, so the resolver (`template_override_id ?? template_id` in `EmployeeAnnualReview.tsx:45` and `formMapping.ts`) should show the new form. **But `template_id` was reverted to the old value after the reset**, which is a data-drift signal that the seed / rules-reapply path clobbers `template_id` even when an override exists. If any code path reads `template_id` directly (not the effective resolver), the employee still sees the old template.

### Root-cause hypotheses to confirm before coding

1. **H1 — Seed / rules-reapply overwrites `template_id` after `force_reset`.** The "seed writer that NEVER clobbers `template_override_id`" (annualReviewService.ts:1066) explicitly protects the override but writes `template_id` from the rule. That would explain why 100357/101762's `template_id` reverted to `a6e88cd5` after the 03:44 reset set it to `0a815c39`.
2. **H2 — At least one render/read path uses `template_id` directly** instead of `resolveEffectiveTemplateId(...)`, so the employee sees the old form despite the override being correct.
3. **H3 — For submitted instances (100846), the "change template" UI silently no-ops** (no override written, no audit) because the write is guarded by status. HR gets no error and assumes the change succeeded.

### Investigation plan (no code yet)

1. Grep every read of `template_id` on `annual_review_instances` and confirm each one either uses `resolveEffectiveTemplateId` or is intentionally the seeded value (admin views only). List offenders.
2. Trace the "change template" UI action HR used for 100846 — find the RPC/handler, check its status guard, and confirm whether it writes an override, mutates `template_id`, or silently returns. Verify with `system_audit_logs` for that employee that no `template_override_set` fired.
3. Trace the writer that rewrote `template_id` back to `a6e88cd5` on 422f7062 / ff6292b0 after 03:44 (candidates: `seedAnnualReviewInstances`, assignment-rule reapply, cascade triggers from ADR-108, cycle default_enabled_stages sweep). Confirm from `system_audit_logs` + `updated_at` sequencing.

### Fix plan (after each hypothesis is confirmed)

**A. Enforce the resolver everywhere (POLICY §AR-TEMPLATE-EFFECTIVE-ONLY)**
- Replace every direct `instance.template_id` read on the employee/reviewer render path with `resolveEffectiveTemplateId(instance)`.
- Add an ESLint rule / test `noRawInstanceTemplateIdOnRenderPath.test.ts` that fails the build if a render-path file references `.template_id` on an instance without going through the resolver.

**B. Stop `template_id` drift when an override exists**
- Update the seed / rules-reapply writer: when `template_override_id IS NOT NULL`, do NOT change `template_id` either — the override is the authoritative signal that HR opted out of rule-driven templating.
- Add a DB trigger `annual_review_instances_template_stability` that blocks writes changing `template_id` while an override is set (except via the explicit `force_reset` / `clear_override` RPCs, which set both together).
- Emit `annual_review.template_id_drift_blocked` audit on any blocked write for observability.

**C. Make "change template" honest for submitted instances (100846 case)**
- The "change template" UI must call an RPC that either (a) sets `template_override_id` and audits it, or (b) returns a typed error like `TEMPLATE_CHANGE_REQUIRES_RESET` when the instance is past `pending_self`.
- UI surfaces the error as a toast + inline banner ("Employee has already submitted — use Force Reset to change the template"), instead of silently no-oping.

**D. One-shot repair for the 3 reported employees**
- 100357, 101762: run `remap_system_scores_by_library_key` (already exists from ADR-116) + set `template_id = template_override_id` so raw reads and effective reads agree; write `annual_review.template_id_resynced` audit rows.
- 100846: leave data alone (already submitted with the CPP-W-E&I template as scored). Reply back to HR with the audit trail proving no template change was ever recorded, and ask which screen was used so we can reproduce and fix the silent no-op in step C.

**E. Regression coverage**
- `templateOverrideStability.test.ts` — seeding an instance with an existing override must not touch `template_id` or `template_override_id`.
- `changeTemplateOnSubmittedInstance.test.ts` — asserts the RPC returns the typed error and no row mutation happens.
- `effectiveTemplateResolver.contract.test.ts` — pins `resolveEffectiveTemplateId` semantics.

### Docs / policy sync (SSOT)

- **ADR-117 — Template override is authoritative; `template_id` must not drift while an override exists.**
- **POLICY §AR-TEMPLATE-EFFECTIVE-ONLY** — render path reads only the effective template.
- **POLICY §AR-TEMPLATE-CHANGE-REQUIRES-RESET** — templates cannot silently change on submitted instances.
- DOCUMENTATION.md: version bump `v2.66.117` with the three symptoms, the RCA table above, and the mitigations.

### Risk & Impact

- **Data:** additive — override + `template_id` become consistent; no destructive change to scored data. Repair only touches the 3 named instances after remap.
- **Workflow:** submitted instances will now show a clear error instead of silently ignoring template changes — expected behaviour.
- **Regression risk:** low if the resolver is enforced via test + ESLint. Medium if the "change template" UI is used across many roles — we'll grep call sites before shipping.
- **Rollback:** all changes are additive (new trigger, new audit action, resolver refactor). Trigger can be dropped; resolver change is a no-op where already correct.

### Deliverable order after approval

1. Confirm H1/H2/H3 with the greps and audit queries above (single investigation batch).
2. Ship A + B + C together with tests.
3. Ship D one-shot repair migration + audit rows.
4. Update ADR-117, POLICY, DOCUMENTATION in the same commit.
