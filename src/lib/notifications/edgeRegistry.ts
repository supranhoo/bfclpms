/**
 * ADR-189 / POLICY §108g — Notification edge registry (SSOT).
 *
 * Every in-app notification `type` produced by the client (or by an RPC on the
 * client's behalf) MUST declare the relationship edge that authorises it in
 * `public.can_send_notification_to`. Tightening the guard without updating this
 * registry — and the branch it points at — is what broke observation replies
 * (ADR-189). `notificationEdgeCoverage.test.ts` fails the build when a producer
 * emits an unregistered type.
 */

export type NotificationEdge =
  | 'global_role' // sender is admin / hr_pms / management / auditor, or target is admin / hr_pms
  | 'hierarchy' // reporting, functional, skip, dept head, BU head (bidirectional)
  | 'audit_assignment' // employee <-> auditor via audit_kpi(_level)_assignments
  | 'annual_review_stage' // annual_review_instances reviewer slots
  | 'proxy_submission' // annual_review_proxy_submissions
  | 'observation_participant'; // ADR-189: both parties participate in the observation thread

export interface NotificationEdgeSpec {
  /** Relationship branches in can_send_notification_to that can authorise this type. */
  edges: NotificationEdge[];
  /**
   * True when the producer must put `observation_id` into notifications.metadata
   * so the guard can evaluate the observation_participant edge.
   */
  requiresObservationContext?: boolean;
  note?: string;
}

export const NOTIFICATION_EDGE_REGISTRY: Record<string, NotificationEdgeSpec> = {
  observation_mention: {
    edges: ['global_role', 'hierarchy', 'audit_assignment', 'observation_participant'],
    requiresObservationContext: true,
    note: 'ADR-189: mention access must be granted before the notification is inserted.',
  },
  query_response_submitted: { edges: ['global_role', 'hierarchy', 'audit_assignment'] },
  query_resolved: { edges: ['global_role', 'hierarchy', 'audit_assignment'] },
  admin_data_entry: { edges: ['global_role'] },
  admin_data_override: { edges: ['global_role'] },
  admin_fast_track_approved: { edges: ['global_role'] },
  admin_status_change: { edges: ['global_role'] },
  admin_status_step_back: { edges: ['global_role'] },
  kra_batch_assigned: { edges: ['global_role', 'hierarchy'] },
  org_kpi_revision_requested: { edges: ['global_role', 'hierarchy'] },
  org_kpi_rollback: { edges: ['global_role', 'hierarchy'] },
  org_kpi_sent_back: { edges: ['global_role', 'hierarchy'] },
  pip_initiated: { edges: ['global_role', 'hierarchy'] },
  pip_completed: { edges: ['global_role', 'hierarchy'] },
  rollback_requested: { edges: ['global_role', 'hierarchy'] },
  rollback_approved: { edges: ['global_role', 'hierarchy'] },
  rollback_rejected: { edges: ['global_role', 'hierarchy'] },
  rollback_active_reviewer: { edges: ['global_role', 'hierarchy'] },
};

export function isRegisteredNotificationType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EDGE_REGISTRY, type);
}

export function edgesFor(type: string): NotificationEdge[] {
  return NOTIFICATION_EDGE_REGISTRY[type]?.edges ?? [];
}
