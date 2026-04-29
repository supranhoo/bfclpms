/**
 * Safety Incident SSOT
 * --------------------
 * Labels, colors, and ordered stage list for the 7-stage Safety incident
 * workflow. UI components MUST import from here — never hardcode strings
 * (workspace policy: zero hardcoding of business variables).
 */

export const SAFETY_INCIDENT_STAGES = [
  'reported',
  'assigned',
  'investigation',
  'rca',
  'corrective_action',
  'verification',
  'closed',
] as const;

export type SafetyIncidentStatus =
  | (typeof SAFETY_INCIDENT_STAGES)[number]
  | 'orphaned';

export const SAFETY_STATUS_LABELS: Record<SafetyIncidentStatus, string> = {
  reported: 'Reported',
  assigned: 'Assigned',
  investigation: 'Investigation',
  rca: 'Root Cause Analysis',
  corrective_action: 'Corrective Action',
  verification: 'Verification',
  closed: 'Closed',
  orphaned: 'Orphaned',
};

export type SafetyIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export const SAFETY_SEVERITY_LABELS: Record<SafetyIncidentSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export type SafetyIncidentType =
  | 'near_miss'
  | 'unsafe_act'
  | 'unsafe_condition'
  | 'accident'
  | 'property_damage'
  | 'environmental';

export const SAFETY_TYPE_LABELS: Record<SafetyIncidentType, string> = {
  near_miss: 'Near Miss',
  unsafe_act: 'Unsafe Act',
  unsafe_condition: 'Unsafe Condition',
  accident: 'Accident',
  property_damage: 'Property Damage',
  environmental: 'Environmental',
};

export type SlaState = 'green' | 'amber' | 'red' | 'closed';

export const SLA_BADGE_VARIANT: Record<SlaState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  green: 'secondary',
  amber: 'default',
  red: 'destructive',
  closed: 'outline',
};

export function nextStage(curr: SafetyIncidentStatus): SafetyIncidentStatus | null {
  if (curr === 'orphaned' || curr === 'closed') return null;
  const idx = SAFETY_INCIDENT_STAGES.indexOf(curr as typeof SAFETY_INCIDENT_STAGES[number]);
  if (idx < 0 || idx >= SAFETY_INCIDENT_STAGES.length - 1) return null;
  return SAFETY_INCIDENT_STAGES[idx + 1];
}

/**
 * Pure mirror of the `safety_incidents_with_sla` view's `sla_state` rule.
 *
 * IMPORTANT: The DB view is the production source of truth. This function
 * exists ONLY for client-side tests and offline previews — never use it
 * to override the value returned by the server.
 *
 * Rule (matches Phase 1.B migration):
 *   - status = 'closed'                    → 'closed'
 *   - now > close_due_at                   → 'red'
 *   - now > acknowledge_due_at             → 'amber'
 *   - otherwise                            → 'green'
 */
export function classifySlaState(input: {
  status: SafetyIncidentStatus;
  acknowledge_due_at: string | Date;
  close_due_at: string | Date;
  now?: Date;
}): SlaState {
  if (input.status === 'closed') return 'closed';
  const now = (input.now ?? new Date()).getTime();
  const ack = new Date(input.acknowledge_due_at).getTime();
  const close = new Date(input.close_due_at).getTime();
  if (now > close) return 'red';
  if (now > ack) return 'amber';
  return 'green';
}

/**
 * Validates a proposed FSM transition against the sequential-only rule
 * enforced server-side by `transition_safety_incident()`. Returns null when
 * legal, or a human-readable reason when the move is illegal.
 *
 * Mirrors (does NOT replace) the DB RPC — UI uses this for pre-flight
 * checks and tests use it to lock the stage graph.
 */
export function validateFsmTransition(
  from: SafetyIncidentStatus,
  to: SafetyIncidentStatus,
): string | null {
  if (from === to) return 'Already at this stage';
  if (from === 'closed') return 'Closed incidents are immutable';
  if (from === 'orphaned') {
    // Orphaned incidents may only be re-assigned (back into the FSM at
    // 'reported') by an admin; that path is server-only.
    return 'Orphaned incidents must be revived server-side';
  }
  if (to === 'orphaned') return null; // exception path, server-validated
  const fromIdx = SAFETY_INCIDENT_STAGES.indexOf(
    from as typeof SAFETY_INCIDENT_STAGES[number],
  );
  const toIdx = SAFETY_INCIDENT_STAGES.indexOf(
    to as typeof SAFETY_INCIDENT_STAGES[number],
  );
  if (fromIdx < 0 || toIdx < 0) return 'Unknown stage';
  if (toIdx !== fromIdx + 1) return 'Transitions must be sequential (no skipping or reversing)';
  return null;
}