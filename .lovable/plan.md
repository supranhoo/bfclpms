

## Fix: Improve THRESHOLD_TARGET_MISMATCH Recommendations

### Problem
The current suggested fixes are generic and misleading:
- "Higher is Better" always suggests "140% of target" — wrong for percentage-based KPIs (e.g., target=100% where R5=100 is correct)
- "Lower is Better" always suggests "60% of target" — equally arbitrary
- No consideration of `threshold_mode` (absolute vs ratio) or UOM type (%, Nos, etc.)

### Fix

**File: `src/components/admin/ScoringHealthCheck.tsx`**

1. **Skip the check for percentage UOM KPIs where target = 100**: If UOM contains "%" or "percent" and target is 100, R5=100 is logically correct (can't exceed 100%). Suppress the flag entirely.

2. **Consider `threshold_mode`**: If `threshold_mode === 'ratio'`, thresholds are already percentages of target — R5 ≤ target in absolute terms is expected. Skip the check for ratio-mode KPIs.

3. **Replace hardcoded percentage suggestions with neutral guidance**: Instead of prescribing "140%" or "60%", use:
   - "R5 threshold equals the target. If R5 should represent exceeding the target, update it in the KPI editor. Review the threshold mode (absolute vs percentage)."

4. **Add UOM context to the description**: Show the UOM in the message so admins can judge whether the flag is relevant.

### What Changes
| Current | New |
|---------|-----|
| Always flags R5 ≤ target for "Higher is Better" | Skips if `threshold_mode = 'ratio'` or UOM is percentage with target=100 |
| "If R5 should be 140% of target, set R5 to X" | "R5 equals target — verify this is intentional. Open KPI editor to review threshold mode and values." |
| "If R5 should be 60% of target, set R5 to X" | "R5 equals target — verify this is intentional for Lower is Better criteria." |

### Files Changed
| File | Action |
|------|--------|
| `src/components/admin/ScoringHealthCheck.tsx` | Smarter THRESHOLD_TARGET_MISMATCH detection + neutral suggestions |
| `DOCUMENTATION.md` | Version history |

### Risk Assessment
- **Regression**: Zero — reduces false positives, no scoring logic changes
- **Scope**: Detection-only, no data or workflow impact

