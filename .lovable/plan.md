

## Move BFCL Logo to Top-Left in All System Emails

### Problem
The company logo currently renders in the **top-right** of the email header (orange banner). The user wants it in the **top-left**.

### Fix

#### `supabase/functions/send-email-notification/index.ts`

Swap the column order in the header table so the logo comes first (left) and the event title comes second (right):

**Current layout** (line 759-762):
```
| [emoji + title]  |  [logo] |
```

**New layout:**
```
| [logo]  |  [emoji + title (right-aligned)] |
```

Changes:
1. **Line 727**: Change logo cell from `text-align:right` to `text-align:left`
2. **Lines 759-761**: Swap the two `<td>` elements — put `logoHtml` first, then the title cell with `text-align:right`

No other files need changes. Redeploy the edge function after.

