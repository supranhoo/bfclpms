

## Plan: Make KRA Score DQ Rule Discoverable in All Programs

### RCA — Why User Can't See It

The KRA Score rule **is already implemented** correctly:
- `DisqualificationRulesEditor.tsx` line 25: `kra_score` is in `RULE_TYPES`
- Compute engine line 389: `case 'kra_score'` evaluates for ALL program types (no program-type gate)
- Works for Port Incentive, Vessel, Basic Salary, Fixed — every program

**The actual UX bug**: the "Add rule:" buttons only appear when there are un-added types (line 259 conditional). In the screenshot, Port Incentive already has 6 of 7 rule types — the lone "+ KRA Score (PMS)" button **is** rendered just below the table, but:
1. It sits in a small grey row easy to miss visually, AND
2. It only shows when not all rules are added — so the moment KRA Score is added, the row disappears entirely with no way to re-add it (other than deleting one).

This makes KRA Score appear "missing" because users don't realize it's behind a small inconspicuous button at the table bottom.

### Fix — Three small UX changes

**1. Always show "Add Rule" as a prominent dropdown button** (replaces the current trailing pill row)
- Use a `DropdownMenu` button labeled **"+ Add DQ Rule"** placed in the card header (right side).
- Dropdown lists all `RULE_TYPES`. Already-added ones are shown disabled with a "✓ Added" badge.
- Always visible regardless of how many rules exist.

**2. Highlight KRA Score visually in the dropdown** so it's discoverable:
- Add a subtle "PMS" badge next to "KRA Score (PMS)" in the dropdown.
- Add helper text under the card description: *"You can gate eligibility on KRA score, absence, LWP, LTI, warnings, suspension, contract status, and more."*

**3. (Confirmed already true) Works in all programs**
- Verified compute engine line 389 evaluates `kra_score` regardless of `program.incentive_base` or `program_type_id` — no gating, applies to all programs.
- The legacy vessel-only `min_kra_score` field on `incentive_programs` (line 448) remains for backward compatibility, but the new DQ rule is the recommended path for all programs.

### UI Mock

```text
┌─ Disqualification Rules ─────────────────────── [ + Add DQ Rule ▾ ] ─┐
│ Configure conditions that disqualify or reduce eligibility.          │
│ Available: Absence, LWP, LTI, Warning, Suspension, Contract, KRA.    │
├──────────────────────────────────────────────────────────────────────┤
│ Rule Type         │ Configuration              │ Active │ Actions    │
│ Absence           │ Threshold: 1 day(s)        │  [●━]  │   🗑       │
│ ...                                                                  │
└──────────────────────────────────────────────────────────────────────┘

Dropdown when clicked:
   + Absence                       ✓ Added
   + LWP (Leave Without Pay)       ✓ Added
   + Warning Letter                ✓ Added
   + Suspension                    ✓ Added
   + Contract Worker               ✓ Added
   + LTI (Lost Time Injury)        ✓ Added
   + KRA Score (PMS)         [PMS]   ← clickable
```

### Files Touched

| File | Change |
|------|--------|
| `src/components/incentive/DisqualificationRulesEditor.tsx` | Replace trailing "Add rule" pill row with header `DropdownMenu` button; show all rule types (added ones disabled); add helper text mentioning KRA score |
| `DOCUMENTATION.md` / `POLICY.md` | v2.65.x — DQ Rules editor: KRA Score is a first-class rule for all programs; surfaced via header "Add DQ Rule" dropdown |

### Risk & Impact

| Area | Impact |
|------|--------|
| Data | None — pure UI re-arrangement |
| Workflow | None — same rule add/edit/delete flow |
| Compute engine | None — already handles `kra_score` for all programs |
| Regression | Low — only the "Add rule" UI control changes |
| Mitigation | Existing rules render identically; only the entry point moves to a more visible location |

### Out of Scope
- Migration of legacy `incentive_programs.min_kra_score` for vessel programs (kept as-is for backward compatibility — the new DQ rule is additive and admin opt-in)

