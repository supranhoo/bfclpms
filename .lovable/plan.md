# Plan: Mobile-Optimized KPI Tables for Review Scorecards ✅ COMPLETE

## Problem Identified

The Team Review, Audit Panel, and Management Review pages show an employee list that works well on mobile. However, when you tap an employee to view their KPIs, the **scorecard components** (EmployeeScorecard, AuditScorecard, ManagementScorecard) still use the desktop-style `KpiDetailsTable` which requires horizontal scrolling on mobile devices.

In contrast, the **My KPIs page** correctly switches to touch-friendly `MobileKpiCard` components when viewed on mobile.

---

## Solution

Apply the same mobile-first pattern used in `MyKpis.tsx` to the three scorecard components, conditionally rendering `MobileKpiCard` on mobile screens instead of the full table.

---

## Components to Update

| Component | Location | Issue |
|-----------|----------|-------|
| EmployeeScorecard | `src/components/review/EmployeeScorecard.tsx` | Uses `KpiDetailsTable` on all screen sizes |
| AuditScorecard | `src/components/review/AuditScorecard.tsx` | Uses `KpiDetailsTable` on all screen sizes |
| ManagementScorecard | `src/components/review/ManagementScorecard.tsx` | Uses `KpiDetailsTable` on all screen sizes |

---

## Implementation Pattern

Replace the current table rendering:

```tsx
// CURRENT (lines ~556-570 in EmployeeScorecard.tsx)
<CardContent>
  <KpiDetailsTable
    kpis={sortedKpis}
    submissionMap={submissionMap}
    viewType="team-review"
    ...
  />
</CardContent>
```

With conditional mobile rendering:

```tsx
// NEW
<CardContent className="px-3 sm:px-6">
  {isMobile ? (
    <div className="space-y-3">
      {sortedKpis.map(kpi => {
        const submission = submissionMap.get(kpi.id);
        return (
          <MobileKpiCard
            key={kpi.id}
            kpi={kpi}
            submission={submission}
            viewType="team-review"
            onAction={openReviewSheet}
            onView={openReviewSheet}
            onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
            onSendBack={openSendBackDialog}
            onToggleExpand={toggleDailyExpand}
            isExpanded={expandedDailyKpis.has(kpi.id)}
            getOrgKpiValue={getOrgKpiValue}
          />
        );
      })}
      {sortedKpis.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">
          No KPIs found for this period
        </p>
      )}
    </div>
  ) : (
    <KpiDetailsTable
      kpis={sortedKpis}
      submissionMap={submissionMap}
      viewType="team-review"
      ...existing props...
    />
  )}
</CardContent>
```

---

## Changes Per File

### 1. EmployeeScorecard.tsx (Team Review)

**Location:** Lines 544-570

- Keep the existing `isMobile` hook (already imported)
- Replace `KpiDetailsTable` block with conditional rendering
- Use `viewType="team-review"` for MobileKpiCard
- Pass `onSendBack` prop for the send-back action

### 2. AuditScorecard.tsx (Audit Panel)

**Location:** Lines 569-593

- Keep the existing `isMobile` hook (already imported)  
- Replace `KpiDetailsTable` block with conditional rendering
- Use `viewType="audit"` for MobileKpiCard
- Pass `onSendBack` prop for the send-back action

### 3. ManagementScorecard.tsx (Management Review)

**Location:** Lines 598-620 (approximately)

- Keep the existing `isMobile` hook (already imported)
- Replace `KpiDetailsTable` block with conditional rendering  
- Use `viewType="management"` for MobileKpiCard
- Pass `onSendBack` prop for the send-back action

---

## Additional Improvements

### Hide Sort Control on Mobile

The `KpiSortControl` in the header should also be hidden on mobile for cleaner UI:

```tsx
// Already done in MyKpis.tsx, apply same pattern
{!isMobile && <KpiSortControl sortConfig={sortConfig} onSortChange={setSort} />}
```

### Consistent Padding

Add `px-3 sm:px-6` to CardContent for better mobile spacing (already used in MyKpis.tsx).

---

## Files Changed

| File | Change Type | Lines Affected |
|------|-------------|----------------|
| `src/components/review/EmployeeScorecard.tsx` | Modify | ~544-570 |
| `src/components/review/AuditScorecard.tsx` | Modify | ~569-593 |
| `src/components/review/ManagementScorecard.tsx` | Modify | ~598-620 |
| `DOCUMENTATION.md` | Update | Add mobile UI section note |

---

## Mobile UX After Implementation

When viewing an employee's KPIs on mobile:

1. Each KPI displays as a **touch-friendly card** showing:
   - Category color dot + name
   - Status badge
   - KRA/KPI names (tappable for logic)
   - Target, Weight, Score metrics
   - Review/View button + Daily expand toggle

2. **Action buttons** are appropriately sized for touch targets

3. **No horizontal scrolling** required

4. **Consistent with My KPIs page** user experience

---

## Testing Checklist

- Team Review: Click employee → verify cards on mobile, table on desktop
- Audit Panel: Same verification
- Management Review: Same verification
- Daily KPIs: Verify expand/collapse works on mobile cards
- Send Back: Verify action works from mobile cards
- Review button: Opens review sheet correctly
