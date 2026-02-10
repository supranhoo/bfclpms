

# Fix: Simplify Tiered KPI Example in Import Template

## Problem
The downloadable PMS template shows raw JSON in the `qualitativeOptions` column for the tiered KPI example row:
```
[{"label":"Compliant","rating":5,"definition":"All safety audits passed"},...]
```
This is confusing and error-prone for users. The system already supports a much simpler approach using `auto` + R-column labels.

## Fix
Update the tiered sample row (row 2) in the template to use the simplified `auto` + R-column syntax instead of raw JSON:

- Set `qualitativeOptions` to `auto`
- Put labels in the corresponding R-columns: `R5="Compliant|All safety audits passed"`, `R3="Partial|Minor non-conformances found"`, `R0="Non-Compliant|Critical violation identified"`

### Before (confusing)
| qualitativeOptions | R5 | R3 | R0 |
|---|---|---|---|
| `[{"label":"Compliant","rating":5,...}]` | _(empty)_ | _(empty)_ | _(empty)_ |

### After (simple)
| qualitativeOptions | R5 | R3 | R0 |
|---|---|---|---|
| `auto` | `Compliant\|All safety audits passed` | `Partial\|Minor non-conformances found` | `Non-Compliant\|Critical violation identified` |

## Files to Change
1. **`src/pages/admin/ImportData.tsx`** -- Update the tiered sample row (lines 1362-1378) to use `auto` and populate R-columns with `Label|Definition` syntax
2. **`DOCUMENTATION.md`** -- Update import template documentation to reflect simplified example
