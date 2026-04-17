

## Plan: KRA Score as a Configurable DQ Rule

### Root-Cause: Why KRA Score Doesn't Show in DQ Rules

Two separate systems exist today:

1. **Hardcoded program-level gate** (`incentive_programs.min_kra_score` + `no_kra_eligible`) — applies ONLY to vessel/fixed-base programs (compute engine line 426). Set in the program edit dialog, not in DQ Rules tab.
2. **DQ Rules tab** (`incentive_disqualification_rules`) — has 6 rule types: `absence`, `lwp`, `warning`, `suspension`, `contract`, `lti`. There is **no `kra_score` rule type**.

So when admin adds "kra_score" in the **Fields** tab, it lands in `incentive_eligibility_fields` (a UI/grid column), but the DQ Rules editor (`DisqualificationRulesEditor.tsx`) only knows the 6 hardcoded rule types — KRA score isn't one of them. Hence it doesn't appear.

### Fix: Add `kra_score` as a 7th first-class DQ rule type (works for ALL incentive programs, not just vessel)

#### 1. Add rule type to the editor
In `DisqualificationRulesEditor.tsx`, extend `RULE_TYPES`:

```ts
{ value: 'kra_score', label: 'KRA Score (PMS)', 
  defaultConfig: { 
    operator: 'gte',          // gte | gt | lte | lt | eq
    threshold: 3,              // numeric KRA score threshold
    action: 'eligible_if_pass',// eligible_if_pass | disqualify_if_fail
    no_kra_action: 'eligible'  // eligible | ineligible (when employee has no PMS score)
  } 
}
```

#### 2. UI mock for the new rule row (DQ Rules tab)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Rule Type      │ Configuration                                  │ Active   │
├────────────────────────────────────────────────────────────────────────────┤
│ [KRA Score]    │ Eligible if KRA  [≥ ▾] [ 3.0 ]                 │  [ ●━ ]  │
│                │ If no KRA score: [Eligible ▾]                  │          │
└────────────────────────────────────────────────────────────────────────────┘
```

`RuleConfigEditor` gets a new case:

- **Operator** select: `≥`, `>`, `≤`, `<`, `=`
- **Threshold** numeric input (step 0.1, range 0–5)
- **No-KRA fallback** select: `Eligible` / `Ineligible`

`ConfigSummary` shows: `Eligible if KRA ≥ 3.0 · No KRA: Eligible`

#### 3. Compute engine wiring (`compute-monthly-incentives/index.ts`)

Add a new case in the DQ rules switch (around line 388):

```ts
case 'kra_score': {
  const op = config.operator || 'gte';
  const threshold = config.threshold ?? 3;
  if (pmsScore === null || pmsScore === undefined) {
    if (config.no_kra_action === 'ineligible') {
      isDQ = true;
      dqReasons.push('No KRA score available');
    }
  } else {
    const pass =
      (op === 'gte' && pmsScore >= threshold) ||
      (op === 'gt'  && pmsScore >  threshold) ||
      (op === 'lte' && pmsScore <= threshold) ||
      (op === 'lt'  && pmsScore <  threshold) ||
      (op === 'eq' && pmsScore === threshold);
    if (!pass) {
      isDQ = true;
      dqReasons.push(`KRA score ${pmsScore.toFixed(2)} fails ${op} ${threshold}`);
    }
  }
  break;
}
```

#### 4. Backward compatibility

- Existing `min_kra_score` / `no_kra_eligible` on `incentive_programs` (vessel-only gate at line 426) **stays as-is** — old vessel programs continue to work.
- New `kra_score` DQ rule is **additive**; admins opt-in by adding it. Applies to ALL program types (basic_salary, fixed, etc.), unlocking KRA gating for non-vessel programs (Port Incentive in screenshot).

#### 5. Why NOT auto-link the "kra_score" Field row from the Fields tab

The Fields tab governs **eligibility data-entry grid columns** (per-employee per-month numeric inputs). KRA score is **system-derived** (from PMS final score), not admin-entered. Treating it as an eligibility field would create a duplicate, manually-overridable value that conflicts with PMS. Correct model: KRA score is a **derived signal** consumed by DQ rules, not a custom data field. We'll add a small note in the Fields tab when the user adds `kra_score`: *"KRA score is auto-pulled from PMS. To gate eligibility on it, add a 'KRA Score' rule in the DQ Rules tab."*

### Files Touched

| File | Change |
|------|--------|
| `src/components/incentive/DisqualificationRulesEditor.tsx` | Add `kra_score` to `RULE_TYPES`, `ConfigSummary`, `RuleConfigEditor` |
| `src/components/incentive/EligibilityFieldsConfig.tsx` | Add inline hint when admin types/adds field with key `kra_score` |
| `supabase/functions/compute-monthly-incentives/index.ts` | Add `case 'kra_score'` in DQ rule switch |
| `DOCUMENTATION.md` / `POLICY.md` | v2.65.x — KRA Score is now a configurable DQ rule for all incentive program types |

### Risk & Impact

| Area | Impact |
|------|--------|
| Data | None — uses existing `incentive_disqualification_rules` table, JSONB `rule_config` |
| Workflow | Additive — admins must explicitly add the rule per program; no auto-application |
| Regression | Low — new switch case only fires when rule exists; vessel `min_kra_score` path untouched |
| Mitigation | Default `operator=gte, threshold=3, no_kra_action=eligible` matches current vessel behaviour for safety |

### Out of Scope

- Removing/migrating legacy `min_kra_score` from `incentive_programs` (kept for vessel programs)
- Auto-creating a `kra_score` DQ rule for existing programs (admin opt-in to avoid surprises)

