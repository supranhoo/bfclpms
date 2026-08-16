/**
 * ADR-288 — client mirror of `bu_console_target_rules_apply` resolution.
 *
 * Precedence: a specific rule (lowest `priority` number wins) beats the
 * `default` rule; a target tuned by hand for one employee always beats a rule
 * unless the admin explicitly ticks "reset tuned targets".
 */
import type { TargetMatchDimension, TargetRule } from '@/hooks/useBuConsoleRun';

export const TARGET_DIMENSIONS: { value: TargetMatchDimension; label: string; hint: string }[] = [
  { value: 'default', label: 'Everyone else', hint: 'Fallback when no other rule matches.' },
  { value: 'level', label: 'Level', hint: 'Matches the employee’s level.' },
  { value: 'designation', label: 'Designation', hint: 'Matches the employee’s designation.' },
  { value: 'department', label: 'Department', hint: 'Matches the employee’s department.' },
  { value: 'is_manager', label: 'Manages people', hint: 'Anyone with active direct reports.' },
];

export interface TargetSubject {
  level?: string | null;
  designation?: string | null;
  departmentId?: string | null;
  isManager?: boolean;
}

const eq = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export function ruleMatches(rule: TargetRule, subject: TargetSubject): boolean {
  switch (rule.match_dimension) {
    case 'default': return true;
    case 'level': return eq(subject.level, rule.match_value);
    case 'designation': return eq(subject.designation, rule.match_value);
    case 'department': return (subject.departmentId ?? '') === (rule.match_value ?? '');
    case 'is_manager': return !!subject.isManager === ((rule.match_value ?? 'true').toLowerCase() === 'true');
    default: return false;
  }
}

/** The rule that would win for this person, or null when nothing matches. */
export function resolveTarget(rules: TargetRule[], subject: TargetSubject): TargetRule | null {
  const matched = rules.filter((r) => ruleMatches(r, subject));
  if (matched.length === 0) return null;
  matched.sort((a, b) => {
    const aDefault = a.match_dimension === 'default' ? 1 : 0;
    const bDefault = b.match_dimension === 'default' ? 1 : 0;
    if (aDefault !== bDefault) return aDefault - bDefault;
    return a.priority - b.priority;
  });
  return matched[0];
}

/** Human summary used on the rules dialog. */
export function describeRule(rule: TargetRule): string {
  if (rule.match_dimension === 'default') return 'Everyone else';
  if (rule.match_dimension === 'is_manager') {
    return (rule.match_value ?? 'true').toLowerCase() === 'true' ? 'Manages people' : 'No direct reports';
  }
  const label = TARGET_DIMENSIONS.find((d) => d.value === rule.match_dimension)?.label ?? rule.match_dimension;
  return `${label} = ${rule.match_value ?? '—'}`;
}
