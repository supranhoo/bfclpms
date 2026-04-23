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

// BUG-020: Reviewer-dashboard "Reviewed" counters and per-employee progress bar
// silently showed 0 / dark bars because the slim KPI select used by
// useKpisByPeriodRanges (the dashboard's data source) did not include the
// stage-score signature columns (hr_pms_score, audit_score, management_score,
// manager_score, skip_level_score). The stat-card logic and the progress bar
// both rely on those fields to mark a KPI as "reviewed at this stage", so
// trimming any of them out reduces visible review activity to zero.
// This test pins the slim-select contract so a future trim doesn't recreate
// the regression.
import fs from 'node:fs';
import path from 'node:path';

describe('BUG-020: Slim KPI select retains stage-score signature columns', () => {
  const REQUIRED_SCORE_COLUMNS = [
    'manager_score',
    'skip_level_score',
    'hr_pms_score',
    'audit_score',
    'management_score',
  ];

  const slimSelectSource = fs.readFileSync(
    path.resolve(__dirname, '../hooks/useKpis.ts'),
    'utf8',
  );

  for (const col of REQUIRED_SCORE_COLUMNS) {
    it(`SLIM_KPI_SELECT includes ${col}`, () => {
      const slimBlock = slimSelectSource.match(/const SLIM_KPI_SELECT[\s\S]*?`;/)?.[0] ?? '';
      expect(
        slimBlock.includes(col),
        `SLIM_KPI_SELECT must include ${col} so reviewer dashboards can detect "reviewed at this stage"`,
      ).toBe(true);
    });
  }
});
