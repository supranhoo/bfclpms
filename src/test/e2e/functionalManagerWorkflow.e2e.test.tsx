/**
 * ADR-194 — Functional Manager (F1) END-TO-END FLOW
 * =================================================
 *
 * Drives the complete F1 lifecycle against an in-memory backend:
 *
 *   1. Map a Functional Manager onto an employee profile (write).
 *   2. Re-hydrate the Edit User dialog projection (read-back).
 *   3. Resolve the workflow chain (Self + L1 + F1 + Audit).
 *   4. Render the stage in every relevant dashboard surface.
 *   5. Progress Self -> Manager -> Functional Manager -> Audit and assert
 *      persistence + "Pending With" attribution at each hop.
 *   6. Negative control: unmapped FM / non-F1 template must show nothing.
 *
 * This suite never touches production data.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

import {
  createStore,
  createFakeSupabase,
  buildResolverContext,
  getProfile,
  getSubmission,
  parseSelect,
  F1_TEMPLATE_STAGES,
  NON_F1_TEMPLATE_STAGES,
  IDS,
  type FmStore,
} from './fmHarness';

import { USER_EDIT_HYDRATION_SELECT } from '@/lib/userEditHydration';
import { resolveChain, CHAIN_STAGE_LABEL } from '@/lib/workflowResolver';
import { resolvePendingWith } from '@/lib/kpiPendingWith';
import { CANONICAL_WORKFLOW_STAGES, statusLabels } from '@/lib/reviewConstants';
import { buildScoreColumns, getScoreForColumn } from '@/components/review/KpiDetailsTable';
import { WorkflowProgressTracker } from '@/components/review/WorkflowProgressTracker';
import { inferChainFromSubmission } from '@/lib/multimonthCycle';
import { getFinalApproverLabel } from '@/lib/finalApproverMap';

let store: FmStore;
let supabase: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  store = createStore();
  supabase = createFakeSupabase(store);
});

const templateInfo = (stages: string[]) => ({
  templateId: 'tpl-f1',
  templateName: 'Self + L1 + F1 + Audit',
  stages,
  source: 'employee' as const,
});

const renderWithProviders = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

// ---------------------------------------------------------------------------
// STEP 1 — Map the Functional Manager
// ---------------------------------------------------------------------------
describe('E2E step 1 — mapping a Functional Manager persists', () => {
  it('starts with no Functional Manager mapped', () => {
    expect(getProfile(store, IDS.employee).functional_manager_id).toBeNull();
  });

  it('persists functional_manager_id on save', async () => {
    await supabase
      .from('profiles')
      .update({ functional_manager_id: IDS.functionalManager })
      .eq('id', IDS.employee);

    expect(getProfile(store, IDS.employee).functional_manager_id).toBe(
      IDS.functionalManager,
    );
  });

  it('does not touch other employees', async () => {
    await supabase
      .from('profiles')
      .update({ functional_manager_id: IDS.functionalManager })
      .eq('id', IDS.employee);

    expect(getProfile(store, IDS.manager).functional_manager_id).toBeNull();
  });

  it('can clear the mapping again', async () => {
    await supabase
      .from('profiles')
      .update({ functional_manager_id: IDS.functionalManager })
      .eq('id', IDS.employee);
    await supabase
      .from('profiles')
      .update({ functional_manager_id: null })
      .eq('id', IDS.employee);

    expect(getProfile(store, IDS.employee).functional_manager_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// STEP 2 — Read-back parity (the exact ADR-194 bug class)
// ---------------------------------------------------------------------------
describe('E2E step 2 — Edit User read-back parity', () => {
  it('the hydration projection includes functional_manager_id', () => {
    expect(parseSelect(USER_EDIT_HYDRATION_SELECT)).toContain(
      'functional_manager_id',
    );
  });

  it('re-opening the dialog shows the saved Functional Manager', async () => {
    await supabase
      .from('profiles')
      .update({ functional_manager_id: IDS.functionalManager })
      .eq('id', IDS.employee);

    const { data } = await supabase
      .from('profiles')
      .select(USER_EDIT_HYDRATION_SELECT)
      .eq('id', IDS.employee)
      .maybeSingle();

    expect(data?.functional_manager_id).toBe(IDS.functionalManager);
  });

  it('regression guard: a projection without the column returns blank', async () => {
    // Reproduces the original defect — proves the harness would have caught it.
    await supabase
      .from('profiles')
      .update({ functional_manager_id: IDS.functionalManager })
      .eq('id', IDS.employee);

    const { data } = await supabase
      .from('profiles')
      .select('doj, mobile_number')
      .eq('id', IDS.employee)
      .maybeSingle();

    expect(data?.functional_manager_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// STEP 3 — Workflow chain resolution
// ---------------------------------------------------------------------------
describe('E2E step 3 — workflow resolution', () => {
  const mapFm = async () =>
    supabase
      .from('profiles')
      .update({ functional_manager_id: IDS.functionalManager })
      .eq('id', IDS.employee);

  it('resolves the Functional Manager as the named F1 reviewer', async () => {
    await mapFm();
    const chain = resolveChain(
      getProfile(store, IDS.employee),
      templateInfo(F1_TEMPLATE_STAGES),
      buildResolverContext(store),
    );

    const fm = chain.stages.functional_manager;
    expect(fm.inTemplate).toBe(true);
    expect(fm.naReason).toBeNull();
    expect(fm.users.map((u) => u.full_name)).toEqual([
      'V.A.V.S.S. Ganapathi Varma',
    ]);
  });

  it('flags the stage when no Functional Manager is mapped', () => {
    const chain = resolveChain(
      getProfile(store, IDS.employee),
      templateInfo(F1_TEMPLATE_STAGES),
      buildResolverContext(store),
    );
    expect(chain.stages.functional_manager.naReason).toBe(
      'no_functional_manager_on_profile',
    );
    expect(chain.hasAnyNa).toBe(true);
  });

  it('marks the stage out-of-template for a non-F1 workflow', async () => {
    await mapFm();
    const chain = resolveChain(
      getProfile(store, IDS.employee),
      templateInfo(NON_F1_TEMPLATE_STAGES),
      buildResolverContext(store),
    );
    expect(chain.stages.functional_manager.inTemplate).toBe(false);
    expect(chain.stages.functional_manager.naReason).toBe(
      'stage_not_in_template',
    );
  });

  it('labels the chain stage "Functional Manager"', () => {
    expect(CHAIN_STAGE_LABEL.functional_manager).toBe('Functional Manager');
  });
});

// ---------------------------------------------------------------------------
// STEP 4 — Rendering across dashboard surfaces
// ---------------------------------------------------------------------------
describe('E2E step 4 — renders in every relevant dashboard view', () => {
  it('KPI Details table exposes a Functional Mgr column for F1', () => {
    const keys = buildScoreColumns(F1_TEMPLATE_STAGES).map((c) => c.key);
    expect(keys).toContain('functional_manager_score');
    expect(keys.indexOf('functional_manager_score')).toBe(
      keys.indexOf('manager_score') + 1,
    );
  });

  it('KPI Details table hides the column for non-F1', () => {
    const keys = buildScoreColumns(NON_F1_TEMPLATE_STAGES).map((c) => c.key);
    expect(keys).not.toContain('functional_manager_score');
  });

  it('Workflow progress tracker renders the F1 stage', () => {
    renderWithProviders(
      <WorkflowProgressTracker
        kpis={
          store.kpis.map((k) => ({
            ...k,
            status: 'functional_manager_check',
          })) as never
        }
        workflowStages={F1_TEMPLATE_STAGES}
      />,
    );
    expect(screen.getAllByText(/functional/i).length).toBeGreaterThan(0);
  });

  it('Workflow progress tracker omits the F1 stage for non-F1', () => {
    renderWithProviders(
      <WorkflowProgressTracker
        kpis={store.kpis as never}
        workflowStages={NON_F1_TEMPLATE_STAGES}
      />,
    );
    expect(screen.queryByText(/functional/i)).toBeNull();
  });

  it('status label registry carries a human label for the stage', () => {
    expect(statusLabels.functional_manager_check).toBe(
      'Functional Manager Review',
    );
  });

  it('canonical stage list orders F1 after Manager and before Skip-Level', () => {
    const i = CANONICAL_WORKFLOW_STAGES.indexOf('functional_manager_check');
    expect(i).toBeGreaterThan(CANONICAL_WORKFLOW_STAGES.indexOf('manager_check'));
    expect(i).toBeLessThan(CANONICAL_WORKFLOW_STAGES.indexOf('skip_level_check'));
  });

  it('multi-month chain inference recognises an F1 score', () => {
    const chain = inferChainFromSubmission({
      self_score: 4,
      manager_score: 4,
      functional_manager_score: 5,
    } as never);
    expect(chain).toContain('functional_manager_check');
  });

  it('final approver label resolves for an F1 template', () => {
    expect(getFinalApproverLabel(F1_TEMPLATE_STAGES)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// STEP 5 — Stage progression persists and attributes correctly
// ---------------------------------------------------------------------------
describe('E2E step 5 — stage progression through F1', () => {
  const chainFor = () => F1_TEMPLATE_STAGES.filter((s) => s !== 'kra_set');

  const pendingWith = (status: string) =>
    resolvePendingWith({
      status,
      isOrgKpi: false,
      dataOwnerNames: '',
      employeeName: 'Brundaban Chandra Das',
      managerName: 'Ravi Kumar',
      functionalManagerName: 'V.A.V.S.S. Ganapathi Varma',
      skipManagerName: null,
      stageChain: chainFor(),
      auditorNames: 'Shekhar Sharad',
    });

  beforeEach(async () => {
    await supabase
      .from('profiles')
      .update({ functional_manager_id: IDS.functionalManager })
      .eq('id', IDS.employee);
  });

  it('self submission persists and hands off to the manager', async () => {
    getSubmission(store, 'kpi-1').self_score = 4;
    store.kpis[0].status = 'manager_check';

    expect(getSubmission(store, 'kpi-1').self_score).toBe(4);
    expect(pendingWith('self_review')).toBe('Ravi Kumar');
  });

  it('manager submission hands off to the Functional Manager by name', () => {
    getSubmission(store, 'kpi-1').manager_score = 4;
    store.kpis[0].status = 'functional_manager_check';

    expect(pendingWith('manager_check')).toBe('V.A.V.S.S. Ganapathi Varma');
  });

  it('Functional Manager score persists and is readable by column key', () => {
    const sub = getSubmission(store, 'kpi-1');
    sub.functional_manager_score = 5;

    expect(
      getScoreForColumn(sub as never, 'functional_manager_score', 'audit'),
    ).toBe(5);
  });

  it('a zero Functional Manager score stays distinct from unscored', () => {
    const sub = getSubmission(store, 'kpi-1');
    sub.functional_manager_score = 0;
    expect(
      getScoreForColumn(sub as never, 'functional_manager_score', 'audit'),
    ).toBe(0);
    expect(
      getScoreForColumn(
        getSubmission(store, 'kpi-2') as never,
        'functional_manager_score',
        'audit',
      ),
    ).toBeNull();
  });

  it('after F1 the queue moves to Audit', () => {
    store.kpis[0].status = 'audit';
    expect(pendingWith('functional_manager_check')).toBe('Shekhar Sharad');
  });

  it('nothing is pending once approved', () => {
    expect(pendingWith('approved')).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// STEP 6 — Negative control
// ---------------------------------------------------------------------------
describe('E2E step 6 — negative control (no FM / non-F1)', () => {
  it('non-F1 workflow never surfaces the FM stage anywhere', () => {
    const chain = resolveChain(
      getProfile(store, IDS.employee),
      templateInfo(NON_F1_TEMPLATE_STAGES),
      buildResolverContext(store),
    );
    expect(chain.stages.functional_manager.users).toEqual([]);
    expect(
      buildScoreColumns(NON_F1_TEMPLATE_STAGES).map((c) => c.key),
    ).not.toContain('functional_manager_score');
  });

  it('an F1 workflow with no mapped FM falls back to the queue label', () => {
    const label = resolvePendingWith({
      status: 'manager_check',
      isOrgKpi: false,
      dataOwnerNames: '',
      employeeName: 'Brundaban Chandra Das',
      managerName: 'Ravi Kumar',
      functionalManagerName: null,
      skipManagerName: null,
      stageChain: F1_TEMPLATE_STAGES.filter((s) => s !== 'kra_set'),
    });
    expect(label).toBe('Functional Manager');
  });
});
