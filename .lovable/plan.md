

## Fix: "Zero-Score N Items" Button Not Activating

### Root Cause

The user typed `0` (the digit) in the confirmation field, but the code requires the exact uppercase string `ZERO`. The button's `disabled` condition is `confirmText !== 'ZERO'`, so it remains unclickable. This is a UX clarity problem — the label says "Type ZERO to confirm" but users naturally type the numeral.

### Corrective Action

Make the confirmation case-insensitive and accept both `ZERO` and `0` as valid inputs:

| File | Change |
|------|--------|
| `EmployeeBulkZeroScoreDialog.tsx` | Change the disabled check from `confirmText !== 'ZERO'` to `!['ZERO', 'zero', '0'].includes(confirmText.trim())` — accepts `ZERO`, `zero`, or `0` |
| `DOCUMENTATION.md` | Log UX fix v2.33.4 |
| `POLICY.md` | Sync version |

**Line ~130 (handleExecute guard):**
```typescript
// Before:
if (confirmText !== 'ZERO') return;
// After:
if (!['ZERO', 'zero', '0'].includes(confirmText.trim())) return;
```

**Line ~345 (button disabled prop):**
```typescript
// Before:
disabled={confirmText !== 'ZERO'}
// After:
disabled={!['ZERO', 'zero', '0'].includes(confirmText.trim())}
```

Also update the label text to clarify accepted inputs:
```
Type ZERO or 0 to confirm
```

### Risk Assessment
- **Data impact**: None
- **Regression risk**: Zero — only relaxes the confirmation input matching
- **UX improvement**: Users who type `0` or `zero` are no longer blocked

