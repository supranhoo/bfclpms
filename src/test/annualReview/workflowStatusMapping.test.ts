import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pendingStatusForRole } from '@/lib/annualReview/workflowEditImpact';
import type { AnnualReviewerRole } from '@/types/annualReview';

interface WorkflowStageScenario {
  role: AnnualReviewerRole;
  expectedStatus: string;
}

function generateWorkflowStageScenarios(): WorkflowStageScenario[] {
  return [
    { role: 'self', expectedStatus: 'pending_self' },
    { role: 'manager', expectedStatus: 'pending_manager' },
    { role: 'skip_manager', expectedStatus: 'pending_skip' },
    { role: 'dept_head', expectedStatus: 'pending_dept' },
    { role: 'bu_head', expectedStatus: 'pending_bu' },
    { role: 'hr', expectedStatus: 'pending_hr' },
    { role: 'management', expectedStatus: 'pending_management' },
  ];
}

const repairMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260725105555_ca78d185-4c80-4db3-b2b0-eaf7c7c3ec2a.sql'),
  'utf8',
);

describe('ADR-168 canonical Annual Review workflow statuses', () => {
  it.each(generateWorkflowStageScenarios())('maps $role to $expectedStatus', ({ role, expectedStatus }) => {
    expect(pendingStatusForRole(role)).toBe(expectedStatus);
  });

  it('repairs both supersede RPCs and fails atomically if the stale mapping is absent', () => {
    expect(repairMigration).toContain("p.proname IN ('set_annual_review_enabled_stages', 'reassign_annual_review_reviewer')");
    expect(repairMigration).toContain("replace(v_definition, 'pending_dept_head', 'pending_dept')");
    expect(repairMigration).toContain('IF v_changed_count <> 2 THEN');
  });

  it('keeps BU Head on its canonical pending_bu status', () => {
    expect(repairMigration).not.toContain("replace(v_definition, 'pending_bu', 'pending_bu_head')");
    expect(pendingStatusForRole('bu_head')).toBe('pending_bu');
  });
});