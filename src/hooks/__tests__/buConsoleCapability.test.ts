import { describe, it, expect } from 'vitest';
import { resolveConsoleCapability } from '@/hooks/useBuConsoleCapability';

const cap = (role: string | null, menuUpdate = false) =>
  resolveConsoleCapability({ role, menuUpdate });

describe('Performance Console write tiers (ADR-285 / POLICY §CONSOLE-WRITE-TIERS)', () => {
  it('admin writes at every stage, KRA Set included', () => {
    const c = cap('admin');
    expect(c.canWrite).toBe(true);
    expect(c.isAdmin).toBe(true);
    expect(c.canActOnStatus('kra_set')).toBe(true);
    expect(c.canActOnStatus('self_review')).toBe(true);
  });

  it.each(['management', 'auditor'])('%s writes only past KRA Set', (role) => {
    const c = cap(role);
    expect(c.canWrite).toBe(true);
    expect(c.isAdmin).toBe(false);
    expect(c.canActOnStatus('kra_set')).toBe(false);
    expect(c.canActOnStatus('self_review')).toBe(true);
    expect(c.canActOnStatus('audit')).toBe(true);
  });

  it('hr_pms stays strictly read-only', () => {
    const c = cap('hr_pms');
    expect(c.canWrite).toBe(false);
    expect(c.isReadOnly).toBe(true);
    expect(c.canActOnStatus('self_review')).toBe(false);
    expect(c.canActOnStatus('kra_set')).toBe(false);
  });

  it.each(['employee', 'manager', 'skip_level', null])('%s cannot write', (role) => {
    expect(cap(role as string | null).canWrite).toBe(false);
  });

  it('an explicit menu update right widens access without a code change', () => {
    const c = cap('hr_pms', true);
    expect(c.canWrite).toBe(true);
    // still not admin — KRA Set remains admin-only design space
    expect(c.canActOnStatus('kra_set')).toBe(false);
  });

  it('treats an unknown or missing status as actionable for writers', () => {
    expect(cap('management').canActOnStatus(undefined)).toBe(true);
    expect(cap('management').canActOnStatus(null)).toBe(true);
  });
});
