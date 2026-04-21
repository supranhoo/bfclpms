

## RCA — "Entered" badge stays even after Propagate

### Confirmed root cause
The KPI in your screenshot (Sajid Raza, "Achieve 3*100 TPD Power Generation target") has **two `org_kpi_values` rows** for `March 2026`:

| Row | employee_id | dept_id | status | achieved | when |
|---|---|---|---|---|---|
| `ef6cd63c…` | Sajid Raza | null | **propagated** | 0 | 11:54 (after Propagate) |
| `bc179d72…` | **null** | **null** | **entered** | 5 | 11:37 (older save, org-scoped) |

The KPI's current `org_level_scope = 'employee'`. The Propagate handler correctly updated only the employee-scoped row.

But `getKpiStatus` in `src/pages/admin/OrgKpiDataEntry.tsx` (lines 192–199) computes the badge for non-organization scopes by **prefix-matching all rows** under the same `(category, kra, kpi)` key, regardless of `employee_id` / `department_id`. It then requires `every` matched row to be `propagated`. The orphan org-scoped row (`status='entered'`) drags the badge back to **Entered**.

The orphan row exists because this KPI was previously saved under `org_level_scope='organization'` (or via a legacy path) before being switched to employee scope. A DB sweep shows this is **widespread** — dozens of employee/department-scoped org KPIs have orphan org-level `org_kpi_values` rows polluting their status.

### Why "showing in Employee's Dashboard" is **not** a separate bug
Propagation correctly wrote Sajid's score to `review_submissions` — that's the intended behavior. The KPI appearing on his dashboard is expected, not a regression.

### Assumptions stated explicitly
1. The orphan rows should be **ignored** when computing badge status for employee/department-scoped KPIs (they don't belong to the current scope).
2. We should not delete the orphan rows in this fix — they are historical data and a separate cleanup decision. The simplest, safest fix is to make `getKpiStatus` scope-aware.
3. No schema change, no RLS change, no policy change.

### Alternatives I considered and rejected
- **Delete orphan rows in a migration.** Higher risk, irreversible, and out of scope for "fix the badge". Listed as optional follow-up only.
- **Change Propagate to also flip orphan rows to 'propagated'.** Wrong — those rows don't represent any real propagated value.

---

## Plan — Minimum-code fix

### Single change
In `src/pages/admin/OrgKpiDataEntry.tsx`, `getKpiStatus` (lines 192–199), filter the prefix match by the current scope so orphan rows from a different scope are ignored:

- For `org_level_scope = 'employee'` → only consider rows where `employee_id IS NOT NULL`.
- For `org_level_scope = 'department'` → only consider rows where `department_id IS NOT NULL`.

Everything else stays the same.

### Files touched
| File | Change |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add scope-aware filter inside `getKpiStatus` (lines 192–199). ~3 lines. |
| `DOCUMENTATION.md` | Append v2.65.3 RCA note: orphan org-scoped rows from legacy saves; status calc now scope-filtered. |

### Out of scope
- No DB cleanup of orphan rows (separate decision).
- No change to Propagate handler — it is already correct.
- No change to `handleCardSave` — it already writes to the correct scope.
- No change to `review_submissions` flow — Sajid's dashboard entry is expected.
- No new tests/abstractions for a 3-line fix.

### Risk & Impact
- **Data:** none — read-only badge logic.
- **Workflow:** none — Propagate already worked; only the badge label was wrong.
- **UI/UX:** badges will now correctly show **Propagated** for employee/department-scope KPIs after propagation, even when legacy orphan rows exist. Affects many KPIs flagged in the DB sweep (positive impact).
- **Regression risk:** very low — the change narrows the filter; org-scope KPIs are unaffected (they use a different code path on line 184–191).
- **Mitigation:** keep the existing org-scope branch untouched; only tighten the employee/department branch.

### Optional follow-up (not in this change)
A one-time cleanup migration could delete `org_kpi_values` rows where `employee_id IS NULL AND department_id IS NULL` and the corresponding KPI's current `org_level_scope <> 'organization'`. Flag for separate approval.

