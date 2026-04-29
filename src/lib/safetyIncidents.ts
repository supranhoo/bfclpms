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