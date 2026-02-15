

# Fix Mobile KPI Card Text Formatting

## Problem

The mobile KPI cards display raw structured KPI text (with "- Description:", "- Formula:", "- Scoring Logic:" markers) as a single unformatted block. On the web/desktop view, the same text is properly formatted with bold markers and line breaks via `renderBoldKpiText` and `whitespace-pre-wrap`.

Two issues cause this:

1. **CSS conflict in Review MobileKpiCard** (`src/components/review/MobileKpiCard.tsx`): The KPI name paragraph has both `line-clamp-2` and `flex items-center gap-1` on the same element. `line-clamp` needs `display: -webkit-box`, but `flex` overrides it to `display: flex`, so the text is never truncated and all structured content spills out.

2. **Missing formatting in Dashboard MobileKpiCard** (`src/components/dashboard/MobileKpiCard.tsx`): This component renders raw `kpi.kra_name` and `kpi.kpi_name` strings without using `renderBoldKpiText` or `whitespace-pre-wrap`, so section markers appear as plain inline text.

## Solution

### 1. Fix Review MobileKpiCard (`src/components/review/MobileKpiCard.tsx`)

Separate the `flex` container from the `line-clamp` text element. Wrap the KPI name text in its own `<span>` with `line-clamp-2`, and keep the Info icon outside:

```text
<!-- Before (broken) -->
<p className="text-[10px] text-muted-foreground line-clamp-2 flex items-center gap-1">
  {renderBoldKpiText(kpi.kpi_name)}
  <Info ... />
</p>

<!-- After (fixed) -->
<div className="flex items-start gap-1">
  <p className="text-[10px] text-muted-foreground line-clamp-2 whitespace-pre-wrap flex-1 min-w-0">
    {renderBoldKpiText(kpi.kpi_name)}
  </p>
  <Info className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
</div>
```

Also add `whitespace-pre-wrap` to the KRA name line so normalized newlines render correctly within the clamp.

### 2. Fix Dashboard MobileKpiCard (`src/components/dashboard/MobileKpiCard.tsx`)

Import and apply `renderBoldKpiText` for both KRA and KPI name fields, and add `whitespace-pre-wrap`:

```text
import { renderBoldKpiText } from '@/components/ui/FormattedText';

<!-- KRA name -->
<p className="font-medium text-sm mb-1 line-clamp-1 whitespace-pre-wrap">
  {renderBoldKpiText(kpi.kra_name)}
</p>

<!-- KPI name -->
<p className="text-xs text-muted-foreground mb-3 line-clamp-2 whitespace-pre-wrap">
  {renderBoldKpiText(kpi.kpi_name)}
</p>
```

### 3. Update DOCUMENTATION.md

Add a note under the mobile UI section about the `line-clamp` and `flex` incompatibility pattern to prevent future regressions.

## Files Changed

| File | Change |
|---|---|
| `src/components/review/MobileKpiCard.tsx` | Separate flex and line-clamp into distinct elements; add `whitespace-pre-wrap` |
| `src/components/dashboard/MobileKpiCard.tsx` | Import and use `renderBoldKpiText`; add `whitespace-pre-wrap` |
| `DOCUMENTATION.md` | Add mobile text formatting note |

## Impact

- Visual fix only -- no database, schema, or logic changes
- Desktop/web view is unaffected
- Properly formatted text with bold section markers and line breaks on mobile
- Text still truncated via `line-clamp` to keep cards compact

