

## Add "Scoring" as Truncation Keyword in `getKpiSummaryText`

### Change
Update `getKpiSummaryText` to truncate before "Scoring" as a fallback between "Formula" and "Logic".

**Priority order:** Formula → Scoring → Logic → full text

### File: `src/lib/textFormatting.ts` (lines 38-46)

```typescript
export function getKpiSummaryText(text: string | null | undefined): string {
  if (!text) return '';
  const normalized = normalizeKpiText(text);
  const formulaIdx = normalized.search(/[-\s]*formula/i);
  if (formulaIdx > 0) return normalized.slice(0, formulaIdx).trim();
  const scoringIdx = normalized.search(/[-\s]*scoring/i);
  if (scoringIdx > 0) return normalized.slice(0, scoringIdx).trim();
  const logicIdx = normalized.search(/[-\s]*logic/i);
  if (logicIdx > 0) return normalized.slice(0, logicIdx).trim();
  return normalized;
}
```

### File: `src/lib/textFormatting.test.ts`
Add test case for the new "Scoring" keyword truncation and update the existing "Logic" test that currently expects partial "Scoring" text in the output.

### No other files affected
The 3 dashboard/card files already call `getKpiSummaryText` — they'll automatically pick up the new behavior.

