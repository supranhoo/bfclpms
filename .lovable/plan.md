
## Diagnosis (verified against DB)

Card *"Handle all breakdowns…"* (Maintenance & Reliability, dept-scoped, 7 scopes) shows as **Propagated** on **May 2026**, so the **Rollback All Scopes** button renders. Clicking it throws *"All scopes for this KPI have already been rolled back or are not in a propagated/approved state."*

**Why the data say the error is technically correct.** For May 2026:

| Table | Counts |
|---|---|
| `org_kpi_values` | 1 row, status = `pending` |
| `kpis` (child, is_org_level=true) | 2 `self_review`, 5 `manager_check`, 3 `approved` |

`useBulkRollbackOrgKpiPropagation` queries OKV `WHERE status IN ('propagated','approved')` and correctly finds **zero rows** → throws the error.

**Why the button shows.** `OrgKpiEntryCard.isPropagated = data.status === 'propagated'`, and `deriveOrgKpiTileStatus` (ADR-055 fact-based branch) returns `'propagated'` because every mapped child has advanced past `kra_set` — even though no OKV row carries propagated/approved status. The card is "propagated by inference", but there is no OKV propagation snapshot to roll back.

Net: the UI guarantees a 100% failure rate for this class of card; the button promises an action the bulk hook cannot perform.

---

## RCA

- Card-tile status SSOT (`deriveOrgKpiTileStatus`) and the bulk-rollback target SSOT (`org_kpi_values` snapshot rows) intentionally diverge per ADR-055 — the card is more permissive so users see "Propagated" when child scorecards are advanced.
- The Bulk Rollback button was gated on the card status, not on the OKV-truth that the hook needs.
- Per-scope **Rollback** (single) is also gated by `data.status === 'propagated'`, but it operates per OKV row and correctly skips when its OKV is `pending`, so the failure is concentrated on the bulk action.

---

## Fix (minimal, presentation-only)

1. **Gate the Bulk Rollback button on OKV-truth, not card-truth.**
   In `OrgKpiEntryCard.tsx`, derive `hasBulkRollbackTarget = (data.scopedRows ?? []).some(r => r.status === 'propagated' || r.status === 'approved')`. Replace the `isPropagated && …` guard on the Bulk Rollback `<AlertDialog>` with `hasBulkRollbackTarget && isAdmin && onBulkRollback && data.scope !== 'organization'`. The single-scope Rollback button remains unchanged.
2. **Improve the hook error copy** so a user who somehow reaches the empty-OKV state (race / out-of-band advance) sees actionable guidance:
   *"No propagated scopes to bulk-roll-back for this period. If child scorecards have advanced through a non-propagation path, roll each scope back individually from the per-row table."*
   The post-error `invalidateQueries(['org-kpi-values'])` already exists — keep it.
3. **Regression test** (`src/test/bulkRollbackOrgKpiPropagation.test.ts`):
   - Add `gate-visibility` case: fact-based propagated card (`data.status='propagated'`, every `scopedRows.status='pending'`) → bulk button must NOT render. Done via a pure helper extracted from the card (see below).
   - Keep the existing stale-cache contract test green.
4. **Extract pure gate helper** `hasBulkRollbackTarget(scopedRows): boolean` into `src/lib/orgKpiStatus.ts` so the rule lives next to `deriveOrgKpiTileStatus` and is unit-testable.

No DB change. No hook contract change beyond the error string. No change to ADR-055 card status behaviour.

---

## Risk & impact

| Dimension | Assessment |
|---|---|
| Data | None. Read-only diagnosis + presentation gate. |
| Workflow | Cards in fact-based-only "propagated" state hide the Bulk Rollback button; admins can still use per-scope Rollback or the Repair Gap action that already exists in the same row. |
| Regression | Cards that genuinely have OKV propagated/approved rows continue to show the button (unchanged behaviour). Verified against the May 2026 case (button will hide) and the April 2026 case (7 OKV propagated → button remains). |
| Tests | New gate test + existing stale-cache contract test. |
| Docs | Append POLICY.md note under the Org KPI Data Entry section: "Bulk Rollback button visibility = OKV-truth, not card-truth." One-liner memory `mem/features/admin/bulk-rollback-okv-gate`. |

## Files

**Edit**
- `src/components/admin/OrgKpiEntryCard.tsx` — replace bulk button gate.
- `src/hooks/useRollbackOrgKpiPropagation.ts` — refined error message only.
- `src/lib/orgKpiStatus.ts` — new pure helper `hasBulkRollbackTarget`.
- `src/test/bulkRollbackOrgKpiPropagation.test.ts` — new gate-visibility case.

**Add**
- `mem/features/admin/bulk-rollback-okv-gate` — one-paragraph rule.

Out of scope: any change to `deriveOrgKpiTileStatus`, any extension of bulk rollback to clear child KPIs at `manager_check`/`approved` (that would destroy reviewer scores and violate POLICY §88 immutability — wrong tool for that scenario).
