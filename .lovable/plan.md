

## Plan: Add Reconfirmation to Production Rates Delete

### RCA
The Production Rates tab (`ProductionRatesTab.tsx`) calls `deleteRate.mutate(id)` directly on the trash-icon click — no confirmation dialog. This violates the project's [Destructive Action Governance](mem://design/destructive-action-governance) policy which mandates `ConfirmDestructiveDialog` on every delete.

### Change
**File:** `src/components/incentive/ProductionRatesTab.tsx`
- Add local state `const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);`
- Trash button `onClick` → `setConfirmDeleteId(rate.id)` instead of direct delete.
- Render `<ConfirmDestructiveDialog>` at the bottom of the component:
  - `open={!!confirmDeleteId}`
  - `title="Delete Production Rate?"`
  - `description="This will permanently delete this rate entry. Historical compute results that already used this rate are preserved, but future recomputes will fall back to the next available rate. This cannot be undone."`
  - `confirmLabel="Delete Rate"`
  - `onConfirm` → `deleteRate.mutate(confirmDeleteId)` then clear state
  - `onCancel` → clear state
  - `isLoading={deleteRate.isPending}`

### Audit — other Incentive Config delete buttons
Quick scan needed for parity (will fix in same pass if missing):
- `IncentiveSlabEditor.tsx` — slab delete
- `DqRulesTab.tsx` / `FieldsTab.tsx` / `BUSubUnitsTab.tsx` / `AllocationTab.tsx` / `VesselRatesTab.tsx` — row delete buttons
- `IncentiveProgramCard.tsx` — program-level delete (likely already wrapped)

Any tab missing the dialog gets the same `ConfirmDestructiveDialog` treatment.

### Files Touched
| File | Change |
|---|---|
| `src/components/incentive/ProductionRatesTab.tsx` | Wrap delete in `ConfirmDestructiveDialog` |
| Other incentive-config tabs (as found) | Same wrap if missing |

### Risk & Impact
| Area | Impact |
|---|---|
| Data | Safer — prevents accidental deletes |
| Workflow | One extra click to confirm |
| Regression | None — purely additive UI guard |

### Out of Scope
- Re-auditing non-incentive pages (separate sweep if desired)

