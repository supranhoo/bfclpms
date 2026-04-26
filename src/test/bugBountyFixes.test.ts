import { describe, it, expect } from 'vitest';
import { ALL_APP_ROLES } from '@/lib/roles';

// BUG-001: Role completeness test
describe('BUG-001: Role coverage', () => {
  const roleColors: Record<string, string> = {
    admin: 'bg-destructive/10 text-destructive',
    manager: 'bg-primary/10 text-primary',
    employee: 'bg-secondary text-secondary-foreground',
    auditor: 'bg-accent text-accent-foreground',
    management: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    hr_pms: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    skip_level: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  };

  it('every canonical role has a color mapping', () => {
    for (const role of ALL_APP_ROLES) {
      expect(roleColors[role], `Missing color for role: ${role}`).toBeDefined();
    }
  });

  it('ALL_APP_ROLES includes hr_pms and skip_level', () => {
    expect(ALL_APP_ROLES).toContain('hr_pms');
    expect(ALL_APP_ROLES).toContain('skip_level');
  });
});

// BUG-002: Email validation test
describe('BUG-002: Email validation', () => {
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('notanemail.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts email with whitespace trimmed', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
});

// BUG-003: XSS escaping test
describe('BUG-003: HTML escaping in PolicyRenderer', () => {
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  it('escapes script tags', () => {
    const result = escapeHtml('<script>alert(1)</script>');
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('escapes img onerror', () => {
    const result = escapeHtml('<img onerror="alert(1)" src="x">');
    expect(result).toContain('&lt;img');
    expect(result).not.toContain('<img');
  });

  it('preserves normal text', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });
});

// BUG-019: Trigger / edge code role-string safety
// RCA: notify_on_kpi_status_change referenced 'audit_lead' which is not in app_role enum,
// causing manager Approve to fail with "invalid input value for enum app_role: audit_lead".
// This test pins the contract: every role string used in SQL/edge code must exist in
// ALL_APP_ROLES (single source of truth in src/lib/roles.ts).
describe('BUG-019: Role-string safety in triggers and edge code', () => {
  const KNOWN_ROLE_REFERENCES = ['auditor', 'admin', 'manager', 'employee', 'management', 'hr_pms', 'skip_level'];

  it('every role literal referenced in code exists in ALL_APP_ROLES', () => {
    for (const role of KNOWN_ROLE_REFERENCES) {
      expect(
        (ALL_APP_ROLES as readonly string[]).includes(role),
        `Role "${role}" referenced in code but missing from app_role enum / ALL_APP_ROLES`,
      ).toBe(true);
    }
  });

  it('rejects the historical "audit_lead" typo', () => {
    expect((ALL_APP_ROLES as readonly string[]).includes('audit_lead')).toBe(false);
  });
});

// BUG-020 (v2.66.7.21): Reviewer-stage scores live on `review_submissions`,
// NOT on `kpis`. A previous fix mistakenly added `manager_score`,
// `skip_level_score`, `hr_pms_score`, `audit_score`, `management_score` to
// SLIM_KPI_SELECT. Those columns do not exist on the `kpis` table, so every
// PostgREST request 400'd silently and the entire reviewer dashboard
// (HR PMS / Audit / Management / Total KPIs / Total Employees) collapsed to 0.
// Additionally, `audit_score` is a typo — the auditor column on
// `review_submissions` is named `auditor_score`.
// This test pins the contract from the opposite direction: SLIM_KPI_SELECT
// must NOT reference any of these reviewer-stage score columns.
import fs from 'node:fs';
import path from 'node:path';

describe('BUG-020: Slim KPI select must not reference review_submissions score columns', () => {
  const FORBIDDEN_SCORE_COLUMNS = [
    'manager_score',
    'skip_level_score',
    'hr_pms_score',
    'audit_score',
    'auditor_score',
    'management_score',
  ];

  const slimSelectSource = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useKpis.ts'),
    'utf8',
  );
  const slimBlock = slimSelectSource.match(/const SLIM_KPI_SELECT[\s\S]*?`;/)?.[0] ?? '';

  for (const col of FORBIDDEN_SCORE_COLUMNS) {
    it(`SLIM_KPI_SELECT does NOT include ${col} (lives on review_submissions)`, () => {
      expect(
        slimBlock.includes(col),
        `SLIM_KPI_SELECT must NOT include ${col}: this column does not exist on the kpis table — it lives on review_submissions and adding it makes every dashboard query 400.`,
      ).toBe(false);
    });
  }

  it('exposes a companion hook for fetching reviewer-stage scores from review_submissions', () => {
    expect(slimSelectSource).toContain('useReviewSubmissionScoresByKpiIds');
    expect(slimSelectSource).toContain("from('review_submissions')");
  });

  it('uses the canonical column name `auditor_score` (not the historical `audit_score` typo)', () => {
    const hookBlock = slimSelectSource.match(/useReviewSubmissionScoresByKpiIds[\s\S]*?^}/m)?.[0] ?? '';
    expect(hookBlock).toContain('auditor_score');
    // The typo must not appear in the new hook
    expect(hookBlock.includes('audit_score,') || hookBlock.includes(' audit_score ')).toBe(false);
  });
});

// BUG-021 (v2.66.7.22): Org KPI status helper must NOT mark an entered-but-not-yet-propagated
// row as "Stuck". 'kra_set' is the normal pre-propagation state. Genuine stuck requires
// OKV.status to already be propagated/approved AND the matching child kpis row still 'kra_set'.
describe('BUG-021: Org KPI status — entered != stuck', () => {
  type Status = 'pending' | 'entered' | 'propagated' | 'stuck';

  const isPropagatedOrApproved = (s: string | null | undefined) =>
    s === 'propagated' || s === 'approved';

  function deriveOrgStatus(opts: {
    okvStatus: string | null;
    hasOkvValue: boolean;
    childKraSetEmpIds: Set<string>;
    relevantEmpIds: string[]; // empty for org scope -> use childKraSetEmpIds size as "any"
  }): Status {
    if (!opts.hasOkvValue) return 'pending';
    if (!isPropagatedOrApproved(opts.okvStatus)) return 'entered';
    const stuckHit = opts.relevantEmpIds.length === 0
      ? opts.childKraSetEmpIds.size > 0
      : opts.relevantEmpIds.some(e => opts.childKraSetEmpIds.has(e));
    return stuckHit ? 'stuck' : 'propagated';
  }

  it('entered employee-scoped Org KPI with kra_set child returns "entered" (NOT "stuck")', () => {
    expect(deriveOrgStatus({
      okvStatus: 'draft',
      hasOkvValue: true,
      childKraSetEmpIds: new Set(['emp-1']),
      relevantEmpIds: ['emp-1'],
    })).toBe('entered');
  });

  it('propagated Org KPI with all children advanced returns "propagated"', () => {
    expect(deriveOrgStatus({
      okvStatus: 'propagated',
      hasOkvValue: true,
      childKraSetEmpIds: new Set(),
      relevantEmpIds: ['emp-1', 'emp-2'],
    })).toBe('propagated');
  });

  it('propagated Org KPI with at least one kra_set child returns "stuck"', () => {
    expect(deriveOrgStatus({
      okvStatus: 'propagated',
      hasOkvValue: true,
      childKraSetEmpIds: new Set(['emp-2']),
      relevantEmpIds: ['emp-1', 'emp-2'],
    })).toBe('stuck');
  });

  it('no OKV value returns "pending"', () => {
    expect(deriveOrgStatus({
      okvStatus: null,
      hasOkvValue: false,
      childKraSetEmpIds: new Set(),
      relevantEmpIds: [],
    })).toBe('pending');
  });

  it('sent_back OKV with kra_set children is "entered", never "stuck"', () => {
    expect(deriveOrgStatus({
      okvStatus: 'sent_back',
      hasOkvValue: true,
      childKraSetEmpIds: new Set(['emp-1', 'emp-2']),
      relevantEmpIds: ['emp-1', 'emp-2'],
    })).toBe('entered');
  });
});

// BUG-022 (v2.66.7.24): Reviewer-stage rosters (HR PMS / Audit / Management) must
// include employees whose KPIs have ALREADY been scored at the stage in the period,
// not only employees whose KPIs are currently AT the stage. Without this, the
// "HR PMS Reviewed", "Auditor Reviewed", and "Management Reviewed" stat cards
// collapse to 0 because scored KPIs belong to employees no longer in the visible
// roster (they advanced to audit / management / approved).
// Also pins the deterministic-hash cache key for useReviewSubmissionScoresByKpiIds.
describe('BUG-022: Reviewer roster includes score-signature seed', () => {
  const orgSource = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useOrganization.ts'),
    'utf8',
  );
  const kpisSource = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useKpis.ts'),
    'utf8',
  );

  it('useProfilesByWorkflowStage maps reviewer stages to score columns', () => {
    expect(orgSource).toContain('STAGE_TO_SCORE_COLUMN');
    expect(orgSource).toContain("hr_pms_review: 'hr_pms_score'");
    expect(orgSource).toContain("audit: 'auditor_score'");
    expect(orgSource).toContain("management_review: 'management_score'");
  });

  it('useProfilesByWorkflowStage queries review_submissions for the score signature', () => {
    expect(orgSource).toContain('scoreSigSeededIds');
    expect(orgSource).toMatch(/from\(['"]review_submissions['"]\)/);
    expect(orgSource).toMatch(/\.not\(scoreColumn[^,]*,\s*['"]is['"],\s*null\)/);
  });

  it('roster filter unions both KPI-presence and score-signature seeds', () => {
    expect(orgSource).toContain('if (seededIds.has(p.id)) return true;');
    expect(orgSource).toContain('if (scoreSigSeededIds.has(p.id)) return true;');
  });

  it('useReviewSubmissionScoresByKpiIds no longer uses fragile length:firstId cache key', () => {
    const hookBlock = kpisSource.match(/useReviewSubmissionScoresByKpiIds[\s\S]*?^}/m)?.[0] ?? '';
    // Old fragile form was: `${kpiIds.length}:${kpiIds[0]}`
    expect(hookBlock).not.toMatch(/\$\{kpiIds\.length\}:\$\{kpiIds\[0\]\}/);
    // New form sorts ids and produces a deterministic hash
    expect(hookBlock).toContain('sort()');
    expect(hookBlock).toMatch(/0x811c9dc5|hash/);
  });
});

// BUG-023 (v2.66.7.25): The Self column in KpiDetailsTable was rendering an amber
// "N/A" badge for Org KPIs because the self_review stage is bypassed (the achieved
// value flows from the Data Owner via org_kpi_values, not from a self-entered score).
// The bypass case must render a tooltipped em-dash, not "N/A". Genuine N/A rows
// (review_submissions.is_na = true) must still surface as N/A.
describe('BUG-023: Org KPI Self column shows tooltipped dash instead of N/A', () => {
  const tableSource = fs.readFileSync(
    path.resolve(__dirname, '../components/review/KpiDetailsTable.tsx'),
    'utf8',
  );

  it('detects the Org KPI Self-bypass case', () => {
    expect(tableSource).toContain('isOrgKpiSelfBypass');
    expect(tableSource).toMatch(/col\.key === 'self_score'/);
    expect(tableSource).toMatch(/kpi\.is_org_level === true/);
  });

  it('genuine N/A submissions still win over the Org KPI bypass', () => {
    // The bypass guard must include `!submission?.is_na` so that explicit N/A
    // rows continue to render the amber "N/A" badge.
    expect(tableSource).toMatch(/isOrgKpiSelfBypass[\s\S]{0,200}!submission\?\.is_na/);
  });

  it('renders a tooltipped explanatory em-dash for the bypass case', () => {
    expect(tableSource).toMatch(/isOrgKpiSelfBypass\s*\?[\s\S]{0,400}<Tooltip>/);
    expect(tableSource).toContain('Self-review is not collected for Org KPIs');
  });
});

// BUG-024 (v2.66.7.26): The KPI Journey Timeline Excel export must include an
// "Assigned Workflow" column showing the resolved per-employee workflow chain
// (e.g. "Self → L1 → HR PMS → Audit → Mgmt"). The on-screen table is
// intentionally unchanged to preserve column density.
describe('BUG-024: KPI Journey export carries Assigned Workflow chain', () => {
  const hookSource = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useKpiJourneyReport.ts'),
    'utf8',
  );
  const pageSource = fs.readFileSync(
    path.resolve(__dirname, '../pages/reports/KpiJourneyReport.tsx'),
    'utf8',
  );

  it('KpiJourneyRow type carries workflowChain', () => {
    expect(hookSource).toMatch(/workflowChain:\s*string/);
  });

  it('handleExport injects an Assigned Workflow column from workflowChain', () => {
    expect(pageSource).toMatch(/'Assigned Workflow':\s*r\.workflowChain/);
  });

  it('on-screen TableHeader does NOT include an Assigned Workflow column (export-only)', () => {
    const headerBlock = pageSource.match(/<TableHeader>[\s\S]*?<\/TableHeader>/)?.[0] ?? '';
    expect(headerBlock).not.toContain('Assigned Workflow');
  });
});

// BUG-025 (v2.66.7.27): TNI detection must distinguish compliance failures
// (auto-zero / non-submission) from genuine skill gaps. Compliance rows are
// surfaced for HR visibility but are not eligible for training plans.
describe('BUG-025: TNI splits compliance gaps from skill gaps', () => {
  const hookSource = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useTNI.ts'),
    'utf8',
  );
  const reportSource = fs.readFileSync(
    path.resolve(__dirname, '../pages/reports/TNIReport.tsx'),
    'utf8',
  );

  it('TNIGapType union includes "compliance"', () => {
    expect(hookSource).toMatch(/TNIGapType\s*=\s*[^;]*'compliance'/);
  });

  it('useTNISummary exposes a complianceGaps count separate from total', () => {
    expect(hookSource).toMatch(/complianceGaps:/);
    // total should reflect training-only (compliance excluded)
    expect(hookSource).toMatch(/total:\s*training\.length/);
  });

  it('TNI Report renders a Compliance Gaps summary card', () => {
    expect(reportSource).toContain('Compliance Gaps');
    expect(reportSource).toMatch(/summary\?\.complianceGaps/);
  });

  it('TNI Report exposes a Gap Type filter on the Individual tab', () => {
    expect(reportSource).toMatch(/gapTypeFilter/);
    expect(reportSource).toContain('Compliance Gaps Only');
    expect(reportSource).toContain('Training Needs Only');
  });

  it('useTrainingNeeds accepts a gapType filter', () => {
    expect(hookSource).toMatch(/gapType\?:\s*TNIGapType/);
    expect(hookSource).toMatch(/\.eq\('gap_type',\s*filters\.gapType\)/);
  });
});

// BUG-026: TNI multi-period filter & Assessment Year (Jul–Jun) range builder
describe('BUG-026: TNI multi-period & AY filtering', () => {
  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  type Mode = 'single' | 'qtd' | 'ytd' | 'ay' | 'custom';
  function buildRanges(mode: Mode, endMonth: string, endYear: number,
    startMonth?: string, startYear?: number) {
    if (mode === 'single') return [{ month: endMonth, year: endYear }];
    if (mode === 'ytd') {
      const ei = MONTHS.indexOf(endMonth);
      return MONTHS.slice(0, ei + 1).map(m => ({ month: m, year: endYear }));
    }
    if (mode === 'qtd') {
      const ei = MONTHS.indexOf(endMonth);
      const qs = Math.floor(ei / 3) * 3;
      return MONTHS.slice(qs, ei + 1).map(m => ({ month: m, year: endYear }));
    }
    if (mode === 'ay') {
      const ei = MONTHS.indexOf(endMonth);
      const ays = ei >= 6 ? endYear : endYear - 1;
      const aye = ei >= 6 ? endYear + 1 : endYear;
      const out: { month: string; year: number }[] = [];
      for (let i = 6; i < 12; i++) out.push({ month: MONTHS[i], year: ays });
      for (let i = 0; i < 6; i++) out.push({ month: MONTHS[i], year: aye });
      return out;
    }
    if (mode === 'custom' && startMonth && startYear !== undefined) {
      const out: { month: string; year: number }[] = [];
      const si = MONTHS.indexOf(startMonth);
      const ei = MONTHS.indexOf(endMonth);
      if (startYear === endYear) {
        for (let i = si; i <= ei; i++) out.push({ month: MONTHS[i], year: startYear });
      } else if (startYear < endYear) {
        for (let i = si; i < 12; i++) out.push({ month: MONTHS[i], year: startYear });
        for (let y = startYear + 1; y < endYear; y++)
          MONTHS.forEach(m => out.push({ month: m, year: y }));
        for (let i = 0; i <= ei; i++) out.push({ month: MONTHS[i], year: endYear });
      }
      return out;
    }
    return [{ month: endMonth, year: endYear }];
  }

  it('AY anchored on April 2026 spans Jul 2025 → Jun 2026', () => {
    const r = buildRanges('ay', 'April', 2026);
    expect(r).toHaveLength(12);
    expect(r[0]).toEqual({ month: 'July', year: 2025 });
    expect(r[11]).toEqual({ month: 'June', year: 2026 });
  });

  it('AY anchored on October 2025 spans Jul 2025 → Jun 2026', () => {
    const r = buildRanges('ay', 'October', 2025);
    expect(r[0]).toEqual({ month: 'July', year: 2025 });
    expect(r[11]).toEqual({ month: 'June', year: 2026 });
  });

  it('YTD up to March returns Jan→Mar of the selected year', () => {
    const r = buildRanges('ytd', 'March', 2026);
    expect(r.map(x => x.month)).toEqual(['January','February','March']);
    expect(r.every(x => x.year === 2026)).toBe(true);
  });

  it('QTD ending May returns Q2 months (Apr, May)', () => {
    const r = buildRanges('qtd', 'May', 2026);
    expect(r.map(x => x.month)).toEqual(['April','May']);
  });

  it('Custom Nov 2025 → Feb 2026 spans the year boundary', () => {
    const r = buildRanges('custom', 'February', 2026, 'November', 2025);
    expect(r).toEqual([
      { month: 'November', year: 2025 },
      { month: 'December', year: 2025 },
      { month: 'January', year: 2026 },
      { month: 'February', year: 2026 },
    ]);
  });

  it('useTNI hooks expose periodRanges + applyPeriodRanges helper', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/hooks/useTNI.ts', 'utf-8');
    expect(src).toMatch(/applyPeriodRanges/);
    expect(src).toMatch(/periodRanges\?:\s*PeriodRange\[\]/);
    expect(src).toMatch(/and\(review_period\.eq\.\$\{r\.month\},review_year\.eq\.\$\{r\.year\}\)/);
  });
});

// BUG-027: Org KPI ↔ Normal KPI scope toggle failed with
// "column rp.month_name does not exist". The trigger and cascading RPC
// referenced wrong review_periods column names. Lock canonical names.
describe('BUG-027: review_periods column names in org-kpi scope functions', () => {
  it('latest fix migration uses rp.period_name and rp.review_year (not month_name/year)', async () => {
    const fs = await import('node:fs');
    const path = 'supabase/migrations/20260425064651_ece950e9-bb5a-422f-9d0f-a22a9ed1ae26.sql';
    const sql = fs.readFileSync(path, 'utf-8');
    // Both functions present
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_sync_org_status_to_future_open_periods/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.change_org_kpi_scope_cascading/);
    // Correct column names used
    expect(sql).toMatch(/rp\.period_name\s*=/);
    expect(sql).toMatch(/rp\.review_year\s*=/);
    // Bad names absent (outside of comments — we strip line comments first)
    const noComments = sql.replace(/--.*$/gm, '');
    expect(noComments).not.toMatch(/rp\.month_name/);
    expect(noComments).not.toMatch(/rp\.year\s*=/);
  });
});

// BUG-028: KPI Journey Timeline Excel export — "Month" column displayed
// workflow status (e.g., self_review, kra_set) because the RPC
// `get_kpi_journey_report` mapped jsonb key `reviewPeriod` to `pg.status`
// instead of `pg.review_period`. Lock the canonical mapping so the Month
// column always shows the assessment month.
describe('BUG-028: get_kpi_journey_report maps reviewPeriod to review_period (not status)', () => {
  it('latest fix migration wires reviewPeriod to pg.review_period', async () => {
    const fs = await import('node:fs');
    const path = 'supabase/migrations/20260425073216_31d04874-9cfa-41e3-8a3b-12bf6d9333d8.sql';
    const sql = fs.readFileSync(path, 'utf-8');
    // The RPC is redefined
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_kpi_journey_report/);
    // CTE must expose review_period and review_year
    expect(sql).toMatch(/k\.review_period\b/);
    expect(sql).toMatch(/k\.review_year\b/);
    // Canonical jsonb mapping
    expect(sql).toMatch(/'reviewPeriod',\s*pg\.review_period/);
    // Bug pattern is gone
    const noComments = sql.replace(/--.*$/gm, '');
    expect(noComments).not.toMatch(/'reviewPeriod',\s*pg\.status/);
  });
});

// BUG-029: TNI report silently shows zeros when training_needs is empty
// for months in the selected range. Two contracts must hold:
//   1) `useBackfillTrainingNeeds` exists and iterates ranges via the existing
//      `detect_training_needs_for_period` RPC.
//   2) `TNIReport` surfaces an empty-period alert and an "Export Detection
//      Status" column so empty months are not mistaken for "no skill gaps".
describe('BUG-029: TNI empty-period guidance & range backfill', () => {
  it('useTNI exposes useBackfillTrainingNeeds calling detect_training_needs_for_period', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/hooks/useTNI.ts', 'utf-8');
    expect(src).toMatch(/export function useBackfillTrainingNeeds/);
    expect(src).toMatch(/supabase\.rpc\(\s*['"]detect_training_needs_for_period['"]/);
    // It must iterate through the ranges, not be a single-shot call.
    expect(src).toMatch(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*ranges\.length/);
  });

  it('TNIReport renders empty-period alert and Detection Status export column', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/pages/reports/TNIReport.tsx', 'utf-8');
    // Empty-state computation
    expect(src).toMatch(/emptyMonths/);
    // Alert UI
    expect(src).toMatch(/No TNI data detected/);
    // Backfill action wired to the new mutation
    expect(src).toMatch(/useBackfillTrainingNeeds/);
    expect(src).toMatch(/Backfill Range/);
    // Export annotation column
    expect(src).toMatch(/'Detection Status'/);
    expect(src).toMatch(/Not detected — run TNI detection/);
  });
});

// BUG-030 (revised v2.66.7.34): Centered overlay is reserved for page
// navigation and initial data loads — NOT for user-initiated refresh clicks.
// PageLoadingOverlay is mounted by DashboardLayout (Suspense fallback +
// RouteDataLoadingGate). The Refresh button keeps its inline spinner only.
describe('BUG-030: PageLoadingOverlay wired into DashboardLayout', () => {
  it('PageLoadingOverlay component exists with required a11y attributes and "Please wait" default', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/ui/PageLoadingOverlay.tsx', 'utf-8');
    expect(src).toMatch(/export const PageLoadingOverlay/);
    expect(src).toMatch(/fixed inset-0/);
    expect(src).toMatch(/items-center justify-center/);
    expect(src).toMatch(/role="status"/);
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/RocketGrowthArt/);
    expect(src).toMatch(/label = 'Please wait'/);
    expect(src).toMatch(/sublabel = 'Loading…'/);
  });

  it('DashboardLayout uses PageLoadingOverlay as Suspense fallback and mounts RouteDataLoadingGate', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/layout/DashboardLayout.tsx', 'utf-8');
    expect(src).toMatch(/from '@\/components\/ui\/PageLoadingOverlay'/);
    expect(src).toMatch(/Suspense fallback=\{<PageLoadingOverlay open label="Please wait" \/>\}/);
    expect(src).toMatch(/function RouteDataLoadingGate/);
    expect(src).toMatch(/useIsFetching/);
    expect(src).toMatch(/useLocation/);
    expect(src).toMatch(/<RouteDataLoadingGate \/>/);
  });
});

// BUG-032 (v2.66.7.34): Per POLICY.md §103, the reviewer grid Refresh button
// must NOT mount a centered overlay. Inline button feedback only.
describe('BUG-032: EmployeeSelectorGrid no longer mounts RefreshOverlay', () => {
  it('grid source does not import or mount RefreshOverlay', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/review/EmployeeSelectorGrid.tsx', 'utf-8');
    expect(src).not.toMatch(/from '@\/components\/ui\/RefreshOverlay'/);
    expect(src).not.toMatch(/<RefreshOverlay\b/);
    expect(src).not.toMatch(/setUserRefreshing/);
    expect(src).not.toMatch(/userRefreshing/);
  });

  it('inline Refresh button still binds to isRefreshing for spinner + disabled state', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/review/EmployeeSelectorGrid.tsx', 'utf-8');
    expect(src).toMatch(/disabled=\{isRefreshing\}/);
    expect(src).toMatch(/isRefreshing\s*\?\s*'animate-spin'/);
  });
});

// BUG-031: KPI Journey Timeline blank — get_kpi_journey_report referenced
// non-existent `audit_logs` table and used wrong status literals
// (`l1_review`, `auditor_review`, `skip_level_review`) instead of the
// project's canonical vocabulary. RPC threw -> page fell back to empty state.
// This test pins the corrected migration so the regression cannot return.
describe('BUG-031: KPI Journey RPC uses canonical audit table & status vocabulary', () => {
  it('migration reads from kpi_audit_logs (not audit_logs) via kpi_id join', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(
      'supabase/migrations/20260425115401_ebf2ad72-5962-4347-a8fd-d3deec4921fe.sql',
      'utf-8'
    );
    // canonical table
    expect(sql).toMatch(/FROM\s+kpi_audit_logs\s+al/);
    // canonical join column
    expect(sql).toMatch(/al\.kpi_id\s+IN\s*\(SELECT\s+id\s+FROM\s+page\)/);
    // wrong table must NOT appear in the new function body
    const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.get_kpi_journey_report')[1] ?? '';
    expect(fnBody).not.toMatch(/FROM\s+audit_logs\b/);
    expect(fnBody).not.toContain("entity_type = 'kpi'");
  });

  it('migration uses canonical status literals (manager_check / skip_level_check / audit)', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(
      'supabase/migrations/20260425115401_ebf2ad72-5962-4347-a8fd-d3deec4921fe.sql',
      'utf-8'
    );
    expect(sql).toMatch(/'status'\)\s*=\s*'manager_check'/);
    expect(sql).toMatch(/'status'\)\s*=\s*'skip_level_check'/);
    expect(sql).toMatch(/'status'\)\s*=\s*'audit'/);
    // forbidden non-canonical literals
    expect(sql).not.toMatch(/'status'\)\s*=\s*'l1_review'/);
    expect(sql).not.toMatch(/'status'\)\s*=\s*'auditor_review'/);
    expect(sql).not.toMatch(/'status'\)\s*=\s*'skip_level_review'/);
  });
});

// BUG-033 (v2.66.7.35): The KPI Journey export's "Assigned Workflow" column
// hardcoded the maximal 6-stage chain for every employee, ignoring the
// per-employee workflow_config. Fix routes the chain through the canonical
// `get_bulk_employee_workflows` resolver and excludes framing stages
// (`kra_set`, `approved`) from the rendered chain.
describe('BUG-033: KPI Journey workflow chain resolved per employee', () => {
  const SQL_PATH =
    'supabase/migrations/20260425120922_50e76309-ed88-4f3d-b48e-3dd5ff9542ac.sql';

  it('migration redefines get_kpi_journey_report and calls the canonical resolver', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_kpi_journey_report/);
    // Per-employee resolution via the canonical helper, scoped to the report period.
    expect(sql).toMatch(/get_bulk_employee_workflows\s*\(/);
    expect(sql).toMatch(/p_period[\s\S]{0,40}p_year/);
  });

  it('migration excludes framing stages (kra_set, approved) from the rendered chain', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(SQL_PATH, 'utf-8');
    // Filter must reference both framing literals.
    expect(sql).toMatch(/NOT IN\s*\(\s*'kra_set'\s*,\s*'approved'\s*\)/);
  });

  it('migration removes the hardcoded 6-stage constant array (anti-pattern)', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(SQL_PATH, 'utf-8');
    // Strip line comments so the historical pattern documented in comments
    // does not falsely trip the assertion.
    const noComments = sql.replace(/--.*$/gm, '');
    expect(noComments).not.toMatch(
      /ARRAY\[\s*'self_review'\s*,\s*'manager_check'\s*,\s*'skip_level_check'\s*,\s*'hr_pms_review'\s*,\s*'audit'\s*,\s*'management_review'\s*\]/
    );
  });
});

// BUG-034 (v2.66.7.36): The page loading overlay art was simplified to show
// only an ascending rocket. The X/Y axes, growth-chart arrows, and ellipse
// were removed. Pin the markup contract so future edits don't silently
// reintroduce the old busy art.
describe('BUG-034: Loading art is rocket-only (no axes, no arrows)', () => {
  const ART_PATH = 'src/components/ui/RocketGrowthArt.tsx';

  it('SVG no longer contains the rg-arrow growth-chart groups', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(ART_PATH, 'utf-8');
    expect(src).not.toMatch(/className="rg-arrow/);
    expect(src).not.toMatch(/rg-arrow-1|rg-arrow-2|rg-arrow-3/);
  });

  it('SVG no longer renders the X/Y axes or their arrowhead polygons', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(ART_PATH, 'utf-8');
    // Old axes used these exact endpoints.
    expect(src).not.toMatch(/x1="20"\s+y1="100"\s+x2="170"/);
    expect(src).not.toMatch(/x1="20"\s+y1="100"\s+x2="20"/);
    // Old arrowhead polygons.
    expect(src).not.toMatch(/points="20,8 16,18 24,18"/);
    expect(src).not.toMatch(/points="178,100 168,96 168,104"/);
  });

  it('rocket + flame remain and component exports both names', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(ART_PATH, 'utf-8');
    expect(src).toMatch(/className="rg-rocket"/);
    expect(src).toMatch(/className="rg-flame"/);
    // Backwards-compatible alias preserves existing imports.
    expect(src).toMatch(/export\s+const\s+RocketGrowthArt\s*=\s*RocketLaunchArt/);
  });
});

// BUG-035: Workflow status NULL-safety guard
// "Compliance to contract shipment/delivery date" KPI showed as "KRA Set"
// after Manager forwarded it. RCA: kpi.status was literally NULL because
// resolveForwardStatus('manager', stages) returned null when manager_check
// was absent from the employee's workflow chain. The UI then re-rendered
// NULL as "KRA Set" via a `|| 'kra_set'` fallback.
describe('BUG-035: NULL kpi.status prevention', () => {
  it('resolveForwardStatus returns null when manager_check is absent from chain', async () => {
    const { resolveForwardStatus } = await import('@/lib/workflowEngine');
    const chain = ['kra_set', 'self_review', 'audit', 'management_review', 'approved'];
    expect(resolveForwardStatus('manager', chain)).toBeNull();
  });

  it('resolveForwardStatus returns concrete status when chain includes manager_check', async () => {
    const { resolveForwardStatus } = await import('@/lib/workflowEngine');
    const chain = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];
    expect(resolveForwardStatus('manager', chain)).toBe('manager_check');
  });

  it('UnifiedScorecard contains an assertResolvableStatus guard before status writes', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/review/UnifiedScorecard.tsx', 'utf-8');
    // The named guard must exist
    expect(src).toMatch(/function assertResolvableStatus/);
    // The submitReview mutation must call it before its kpis update
    expect(src).toMatch(/assertResolvableStatus\(newStatus, viewLevel\)/);
    // The 3 handleSubmitReview branches must short-circuit on null with a toast
    const toastGuards = src.match(/if \(newStatus == null\)\s*\{\s*toast\(\{[\s\S]*?Workflow misconfigured/g);
    expect(toastGuards?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('MobileKpiCard (dashboard) no longer falls back to "kra_set" when status is null', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/dashboard/MobileKpiCard.tsx', 'utf-8');
    expect(src).not.toMatch(/statusLabels\[kpi\.status \|\| 'kra_set'\]/);
    expect(src).toMatch(/Status Missing/);
  });

  it('Reviewer status badges show "Status Missing" for null status', async () => {
    const fs = await import('node:fs');
    const files = [
      'src/components/review/MobileKpiCard.tsx',
      'src/components/review/MobileSelfReviewCard.tsx',
      'src/components/review/SelfReviewSheet.tsx',
      'src/components/review/KpiDetailsTable.tsx',
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src, `${f} should render Status Missing fallback`).toMatch(/Status Missing/);
    }
  });
});
