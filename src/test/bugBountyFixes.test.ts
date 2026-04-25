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
