## Goal

In System Settings → Increment → Confirmation Adjustment, when the admin selects an Assessment Year that has no Confirmation Increment Adjustment rule configured (any scope), render an empty-state block in place of the configuration form. The form appears only after the admin clicks **Configure for this Assessment Year**. AYs that already have a rule continue to load and render exactly as today.

## Risk & Impact Report

- Data Impact: None. No schema change; no new writes triggered by AY selection. Existing `useConfirmationIncrementRule` query is reused.
- Workflow Impact: Admin gains an explicit gate before editing. No change to save semantics — only the existing Save button still persists.
- UI/UX Impact: A new empty-state appears below the AY selector / status badges, replacing scope + transitions + treatment + notes + save + history blocks. Existing styling (Card, Badge, spacing) is preserved.
- Regression Risk: Low. Other Increment tabs (Eligibility Criteria, Increment Method, General Eligibility, Increment Slabs) are untouched. Only `ConfirmationIncrementSection.tsx` is modified.
- Scalability Impact: One extra lightweight `select id … limit 1` per AY change to detect "any rule exists for this AY across any scope". Cached by react-query.
- Mitigation: Reset local form state and the "configure intent" flag whenever the AY changes; keep existing hooks/keys.

## Existence Detection

Current `useConfirmationIncrementRule(scope)` only finds the active rule for the *current scope tuple* (AY + company/category/level). A global rule wouldn't be visible while the user is in `per_company` mode and vice-versa, so it's not a reliable "does any rule exist for this AY" probe.

Add a new tiny hook in `src/hooks/useConfirmationIncrementRule.ts`:

```ts
export function useConfirmationIncrementRuleExists(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['confirmation-increment-rule-exists', assessmentYear],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('confirmation_increment_rules')
        .select('id')
        .eq('assessment_year', assessmentYear)
        .eq('status', 'active')
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
}
```

This is one row, indexed by AY, and only fires once per AY (cached).

## UI Changes

File: `src/components/admin/scoring/ConfirmationIncrementSection.tsx`

1. Add `const [configureIntent, setConfigureIntent] = useState(false);`
2. Reset it whenever the AY changes:
   - Replace `onValueChange={setAssessmentYear}` with a handler that calls `setAssessmentYear(v); setConfigureIntent(false);` and also resets `companyScopeMode='global'`, `selectedCompanyIds=[]`, `perCompanyId=null`, and the existing `hydratedFor` sentinel so local form state cannot leak across AYs.
3. Call `const { data: anyRuleExists, isLoading: existsLoading } = useConfirmationIncrementRuleExists(assessmentYear);`
4. Compute `const showEmptyState = !existsLoading && anyRuleExists === false && !configureIntent;`
5. Layout inside `<CardContent>` stays:
   - AY selector + scope badge row (unchanged).
   - `<Separator />`.
   - Then branch:
     - If `existsLoading` → existing spinner pattern (`Loading rule…`).
     - Else if `showEmptyState` → render the empty-state block (below).
     - Else → render the existing Company Scope + Applicable Transitions + Treatment + Notes + Save + History blocks **unchanged**.

Empty-state block (uses existing tokens — no new components):

```tsx
<div className="rounded-md border border-dashed p-8 text-center space-y-3">
  <div className="text-base font-semibold">
    No configuration found for selected assessment year
  </div>
  <p className="text-sm text-muted-foreground max-w-xl mx-auto">
    No confirmation increment adjustment rules have been configured for
    Assessment Year <span className="font-medium">{assessmentYear}</span>.
    You can create a new configuration for this assessment year if required.
  </p>
  <Button onClick={() => setConfigureIntent(true)}>
    Configure for this Assessment Year
  </Button>
</div>
```

Replace the existing `Badge "No rule yet — defaults to 'Ignore'"` line so it only shows when the form is visible (i.e. when not in empty state) — avoids contradicting the empty-state copy.

No other elements move. Save button still calls the existing `useSaveConfirmationIncrementRule` mutation; nothing is persisted by toggling `configureIntent`.

## Acceptance Mapping

- AY with existing config → `anyRuleExists=true` → form renders, scope-specific `useConfirmationIncrementRule` hydrates exactly as today.
- AY without config → empty state with Configure button.
- Click Configure → `configureIntent=true` → form renders with safe defaults (global scope, `trainee_to_confirmed`, `ignore`). Nothing is saved until the admin clicks Save.
- Switch AY → `configureIntent` resets to `false`, scope resets to global, `hydratedFor` resets — no stale form state carries over.
- Other Increment tabs are not touched.

## Tests / Mock

Add `src/components/admin/scoring/__tests__/ConfirmationIncrementSection.empty-state.test.tsx`:

- Mock `useConfirmationIncrementRuleExists` → `false`: asserts the empty-state title, message containing the AY, and Configure button are visible; asserts Company Scope / Treatment blocks are not rendered.
- Click Configure → asserts Company Scope and Treatment blocks become visible and no save mutation was fired.
- Mock returns `true`: asserts form renders directly and empty-state is absent.
- Change AY while `configureIntent` was true → asserts empty-state returns when the next AY has no rule.

## Docs

- `DOCUMENTATION.md` → System Settings › Increment › Confirmation Adjustment: document the empty-state gate, the Configure button, AY-level existence probe, and state-reset behaviour on AY change.
- `POLICY.md` → Note: "Selecting an Assessment Year never auto-creates a Confirmation Increment Adjustment rule. Admin must explicitly click Configure and then Save."

## Files Touched

- `src/components/admin/scoring/ConfirmationIncrementSection.tsx` (UI gate + AY reset)
- `src/hooks/useConfirmationIncrementRule.ts` (add `useConfirmationIncrementRuleExists`)
- `src/components/admin/scoring/__tests__/ConfirmationIncrementSection.empty-state.test.tsx` (new)
- `DOCUMENTATION.md`, `POLICY.md`

No DB migration. No new dependencies. No changes to other Increment tabs, save mutation, or RLS.

## Rollback

Revert the four files. The new hook is additive; removing it has no DB or data impact.
