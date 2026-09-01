export type InvocationMode = 'scheduled' | 'manual';

export interface InvocationContext {
  triggeredBy?: string | null;
  hasValidCronSecret: boolean;
}

/**
 * Scheduled identity is anchored to the validated cron secret. Legacy body
 * labels remain accepted so dry-run probes and older schedulers stay safe.
 */
export function resolveInvocationMode(context: InvocationContext): InvocationMode {
  const label = context.triggeredBy?.trim().toLowerCase();
  return context.hasValidCronSecret || label === 'cron' || label === 'system'
    ? 'scheduled'
    : 'manual';
}

export interface IssuanceGuardArgs {
  mode: InvocationMode;
  force?: boolean;
  employeeIds: string[];
  issuedEmployeeIds: string[];
  targetKpis: Array<{ employee_id: string; review_period: string }>;
  targetMonth: string;
}

export function resolveIssuanceSkipSet(args: IssuanceGuardArgs): Set<string> {
  const skip = new Set<string>();
  if (args.mode !== 'scheduled' || args.force) return skip;

  const requested = new Set(args.employeeIds);
  for (const id of args.issuedEmployeeIds) {
    if (requested.has(id)) skip.add(id);
  }
  for (const targetKpi of args.targetKpis) {
    if (targetKpi.review_period === args.targetMonth && requested.has(targetKpi.employee_id)) {
      skip.add(targetKpi.employee_id);
    }
  }
  return skip;
}

export function projectedTargetWeightage(
  existingRows: Array<{ review_period: string; weightage?: number | null }>,
  pendingRows: Array<{ review_period: string; weightage?: number | null }>,
  targetMonth: string,
): number {
  return [...existingRows, ...pendingRows]
    .filter((row) => row.review_period === targetMonth)
    .reduce((sum, row) => sum + Number(row.weightage ?? 0), 0);
}

export function exceedsScheduledWeightageLimit(total: number): boolean {
  return total > 100.5;
}
