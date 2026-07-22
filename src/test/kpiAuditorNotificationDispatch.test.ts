import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  kpiAuditorNotificationFixture as fixture,
  resolveAssignedAuditors,
} from './fixtures/kpiAuditorNotificationAssignments';

function latestStatusNotificationMigration(): string {
  const dir = resolve(__dirname, '../../supabase/migrations');
  const file = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .reverse()
    .find((name) => readFileSync(resolve(dir, name), 'utf8')
      .includes('CREATE OR REPLACE FUNCTION public.notify_on_kpi_status_change'));
  if (!file) throw new Error('notify_on_kpi_status_change migration not found');
  return readFileSync(resolve(dir, file), 'utf8');
}

describe('assignment-scoped KPI auditor notification dispatch', () => {
  const sql = latestStatusNotificationMigration();

  it('selects both KPI-level and employee-level assignments', () => {
    expect(sql).toContain('FROM public.audit_kpi_level_assignments la');
    expect(sql).toContain('WHERE la.kpi_id = NEW.id');
    expect(sql).toContain('FROM public.audit_kpi_assignments a');
    expect(sql).toContain('WHERE a.employee_id = v_employee_id');
  });

  it('does not broadcast audit-ready notifications from user_roles', () => {
    expect(sql).not.toMatch(/FROM\s+public\.user_roles[\s\S]*role\s*=\s*'auditor'/i);
  });

  it('deduplicates dual assignments and excludes unrelated auditors', () => {
    const recipients = resolveAssignedAuditors({
      kpiLevel: [
        { kpiId: fixture.kpiId, auditorId: fixture.kpiAssignedAuditorId },
        { kpiId: fixture.kpiId, auditorId: fixture.employeeAssignedAuditorId },
      ],
      employeeLevel: [
        { employeeId: fixture.employeeId, auditorId: fixture.employeeAssignedAuditorId },
        { employeeId: 'other-employee', auditorId: fixture.unrelatedAuditorId },
      ],
      activeLoginIds: new Set([
        fixture.kpiAssignedAuditorId,
        fixture.employeeAssignedAuditorId,
        fixture.unrelatedAuditorId,
      ]),
    });

    expect(recipients).toEqual([
      fixture.kpiAssignedAuditorId,
      fixture.employeeAssignedAuditorId,
    ]);
    expect(recipients).not.toContain(fixture.unrelatedAuditorId);
  });

  it('filters inactive/non-login recipients and preserves best-effort delivery', () => {
    expect(sql).toContain('auditor_profile.is_active = true');
    expect(sql).toContain('FROM auth.users au WHERE au.id = recipients.auditor_id');
    expect(sql).toMatch(/EXCEPTION WHEN foreign_key_violation THEN NULL/);
  });

  it('revokes anonymous execution', () => {
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.notify_on_kpi_status_change() FROM PUBLIC',
    );
  });
});