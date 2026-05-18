## What the screenshot is actually showing

For "Proactive Safety Reporting" (May 2026, Per-Employee scope), six rows (Deepak, Pradip, Anant, Mrutyunjaya, Parshu, Badal, V.A.V.S.S.) display **`0`** in the input and a red **`0 – Not Achieved`** rating chip, yet the pill says **`Not propagated`** and the footer shows **`Saving…`**.

### Database truth (just verified)
| Source | Value |
|---|---|
| `org_kpi_values.achieved_value` | **NULL** for all 6 |
| `org_kpi_values.status` | `entered` |
| `review_submissions` for child `kpis.id` | **no row exists** |
| `kpis.status` | `kra_set` (eligible) |

So `buildCardData` legitimately returns `achievedValue = null` for those rows. The `0` you see in the input is **local React state from this editing session** — either typed by the user or filled by a bulk/repair action — that has not yet been persisted (`Saving…` is still in flight, or it was silently dropped on a prior save).

### Why "Not propagated" stays red even though `0` is visible
Two code paths intentionally suppress zero values:

- `src/pages/admin/OrgKpiDataEntry.tsx` line 905 (v2.65.4 guard):
  ```ts
  if (!sv._touched && sv.achievedValue === 0 && !sv.isNa) {
    consideredScopeIds.push(sv.scopeId);
    continue;   // ← Propagate skips this row silently
  }
  ```
- The same file's `handleCardSave` writes `0` to OKV correctly **only when `_touched` is set**. If the `0` arrived from a bulk-fill / Repair Gap path that didn't flag `_touched`, the save short-circuits and OKV remains `NULL`.

Result: the user sees `0`, the chip says `0 – Not Achieved`, but the DB never received the value, so propagation has nothing to push → pill stays "Not propagated". This is **not the same regression as the earlier RCAs** (ADR-053/055/061) — those were about values existing but not flowing. This one is about values that look saved but were silently dropped because of the un-touched-zero guard.

---

## Fix plan (UI + safety only — no migration)

### 1. Make the per-row pill explain itself
In `src/components/admin/OrgKpiScopedEntryTable.tsx`, when `row.status === 'not_propagated'`, render one of three reason micro-labels under the pill:
- `"No value entered"` — `achievedValue === null && !isNa`
- `"0 not saved — click into cell"` — `achievedValue === 0 && !isNa && OKV value is null` (detected via a new `dbAchievedValue` prop carried through `buildCardData`)
- `"Saving… retry Propagate"` — there is an in-flight save mutation for this scopeId
- `"Reviewer locked"` — child KPI past `kra_set`
This collapses the current ambiguity into a single readable cause without changing any business rule.

### 2. Tighten the silent-zero guard
- Replace the `Propagate` skip at line 905 with a **dialog warning** ("3 rows hold `0` but were not edited this session — propagate them anyway?") instead of a silent `continue`. Default action = "Skip"; user can opt-in to push.
- In `handleCardSave`, when an untouched `0` is being skipped from persistence, also log a console warning **and** raise a toast: *"3 rows show 0 but were not flagged as edited; click into each cell once and Save again."* No silent drops.

### 3. Self-heal stale local `0` from bulk paths
Audit the four places that mutate `scopedValues.achievedValue` without flipping `_touched`:
- `OrgKpiScopedEntryTable.handleBulkFill` (already touches — verify)
- `OrgKpiInheritanceReconciler` write-back
- `useRepairOrgKpiPropagationGap` write-back  
- the keyboard "fill remaining" shortcut

For each, mark `_touched = true` on the scope rows it mutates so the existing guards no longer apply.

### 4. Make the OKV row "value matches DB" visible
Pass `dbAchievedValue` (raw `org_kpi_values.achieved_value`) into `ScopedRow`. When `dbAchievedValue !== achievedValue` AND there's no in-flight save, render an amber "unsaved" badge next to the input. Eliminates the "is this number actually in the DB?" guessing game for owners.

### 5. Regression coverage
- `src/test/orgKpiZeroPropagationGuard.test.ts` — locks: (a) touched `0` ⇒ propagates, (b) untouched `0` ⇒ confirm dialog appears, (c) NULL OKV with local `0` ⇒ row pill says `"0 not saved"`.
- Extend `src/test/orgKpiTileStatusChipParity.test.ts` with the per-employee `Not propagated + visible 0` case.

### 6. Docs
- New ADR-063: "Silent zero-skip guard surfaced + user-confirmable".
- Update `mem/features/admin/org-kpi-propagation-truth.md` with the three new pill reasons.
- POLICY.md §111.7: "Propagate must never silently skip a row that shows a value to the user; either the value is pushed, or the user is told why it can't be."

---

## Risk & impact

- **Data**: no schema change. OKV/`kpis`/`review_submissions` semantics unchanged. The propagation RPC is untouched — only the client decides whether to call it.
- **Workflow**: net effect = fewer surprises. The only behaviour change is that an *untouched 0* now triggers a confirm dialog instead of a silent skip.
- **UI/UX**: three small reason labels + one amber "unsaved" badge. No layout change.
- **Regression**: low — guarded by the two test files above and the existing 8 tile-status tests.
- **Mitigation**: ship behind no flag; reason labels are additive; guard change is opt-in via dialog, defaulting to current behaviour.

After you approve, I'll implement (1)–(5) in one pass and write ADR-063 + the POLICY update in the same step.
