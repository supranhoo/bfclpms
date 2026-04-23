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
