import { isToday, isAfter, isBefore, startOfWeek, startOfToday, startOfMonth, formatDistanceToNow, differenceInHours } from 'date-fns';
import { parseSearchSyntax } from './inboxSearchParser';
import type { InboxFiltersState } from '@/components/inbox/InboxFilters';

export interface InboxItem {
  id: string;
  type: 'notification' | 'query';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  notificationType?: string;
  queryStatus?: 'open' | 'responded' | 'resolved';
  kpiId?: string | null;
  kpiName?: string | null;
  kraName?: string | null;
  fromUser?: { id: string; fullName: string | null; email: string } | null;
  toUser?: { id: string; fullName: string | null; email: string } | null;
  metadata?: Record<string, any>;
  resolutionNotes?: string | null;
  evidenceUrl?: string | null;
  snoozedUntil?: string | null;
  snoozeCount?: number;
  ticketNumber?: string | null;
}

export interface GroupedInboxItems {
  label: string;
  items: InboxItem[];
}

/**
 * Group inbox items by date: Today, This Week, Earlier
 */
export function groupByDate(items: InboxItem[]): GroupedInboxItems[] {
  const today = startOfToday();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday start

  const groups: GroupedInboxItems[] = [
    {
      label: 'Today',
      items: items.filter(i => isToday(new Date(i.createdAt))),
    },
    {
      label: 'This Week',
      items: items.filter(i => {
        const date = new Date(i.createdAt);
        return isAfter(date, weekStart) && !isToday(date);
      }),
    },
    {
      label: 'Earlier',
      items: items.filter(i => {
        const date = new Date(i.createdAt);
        return isBefore(date, weekStart);
      }),
    },
  ];

  return groups.filter(g => g.items.length > 0);
}

/**
 * Format relative time for inbox items
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  
  if (isToday(date)) {
    return formatDistanceToNow(date, { addSuffix: false });
  }
  
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Get notification type label for display
 */
export function getNotificationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    kpi_submitted: 'KPI Submitted',
    kpi_approved: 'KPI Approved',
    kpi_finalized: 'KPI Finalized',
    kpi_ready_for_audit: 'Ready for Audit',
    kpi_ready_for_management: 'Ready for Management',
    query_raised: 'Query Raised',
    query_resolved: 'Query Resolved',
    query_responded: 'Query Responded',
    admin_status_step_back: 'Status Rolled Back',
    admin_status_change: 'Status Changed',
    admin_data_entry: 'Data Updated by Admin',
    manager_rejected: 'Sent Back by Manager',
    kra_assigned: 'KRA Assigned',
    kra_batch_assigned: 'KRAs Assigned',
    observation_raised: 'Observation Raised',
    observation_reply: 'Observation Reply',
    observation_resolved: 'Observation Resolved',
    observation_mention: '@Mentioned in Observation',
    period_locked: 'Period Locked',
    pip_initiated: 'PIP Initiated',
    pip_completed: 'PIP Completed',
    pip_milestone_reminder: 'PIP Milestone Reminder',
    password_rollout: 'Password Reset',
    query_response_submitted: 'Query Response',
    query_resolved_fyi: 'Query Resolved',
    rollback_requested: 'Rollback Requested',
    rollback_approved: 'Rollback Approved',
    rollback_rejected: 'Rollback Dismissed',
  };
  return labels[type] || type;
}

/**
 * Get query status color classes
 */
/**
 * Convert internal workflow status codes to human-readable labels
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    kra_set: 'KRA Set',
    self_review: 'Self Review',
    manager_check: 'Manager Review',
    functional_manager_check: 'Functional Manager Review',
    skip_level_check: 'Skip-Level Review',
    hr_pms_check: 'HR PMS Review',
    audit: 'Audit',
    management_review: 'Management Review',
    approved: 'Approved',
  };
  return labels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getQueryStatusClasses(status: 'open' | 'responded' | 'resolved'): string {
  switch (status) {
    case 'open':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'responded':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'resolved':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/**
 * Determine the available quick action for an inbox item
 */
export interface QuickAction {
  type: 'respond' | 'accept';
  label: string;
}

export function getQuickAction(item: InboxItem, currentUserId: string): QuickAction | null {
  if (item.type === 'query') {
    if (item.queryStatus === 'open' && item.toUser?.id === currentUserId) {
      return { type: 'respond', label: 'Respond' };
    }
    if (item.queryStatus === 'responded' && item.fromUser?.id === currentUserId) {
      return { type: 'accept', label: 'Accept' };
    }
  }
  return null;
}

/**
 * Compute SLA status for a query item.
 * SLA target is 48 hours (2 days).
 */
const SLA_TARGET_HOURS = 48;
const SLA_AT_RISK_HOURS = 36; // 75% of SLA

export type SlaStatus = 'on-time' | 'at-risk' | 'overdue';

export function getItemSlaStatus(item: InboxItem): SlaStatus | null {
  if (item.type !== 'query' || item.queryStatus === 'resolved') return null;

  const elapsed = differenceInHours(new Date(), new Date(item.createdAt));
  if (elapsed > SLA_TARGET_HOURS) return 'overdue';
  if (elapsed > SLA_AT_RISK_HOURS) return 'at-risk';
  return 'on-time';
}

/**
 * Apply client-side filters (including advanced search syntax) to inbox items.
 */
/**
 * Get the navigation path for a notification or query item.
 * Returns null if no meaningful deep-link exists (fallback to detail sheet).
 */
export function getNotificationNavigationPath(item: InboxItem, currentUserId?: string, currentRole?: string): string | null {
  if (item.type === 'query') {
    // Queries open detail sheet — no direct navigation
    return null;
  }

  const meta = item.metadata || {};
  const metaEmployeeId = meta.employee_id || null;
  // Determine if this notification is about the current user's own KPI
  const isSelfTargeted = currentUserId && (!metaEmployeeId || metaEmployeeId === currentUserId);

  // Helper: map viewer role to dashboard view context
  const roleToView = (role?: string): string => {
    switch (role) {
      case 'admin':
      case 'manager':
        return 'team';
      case 'auditor':
        return 'audit';
      case 'management':
        return 'management';
      case 'hr_pms':
        return 'team'; // HR PMS uses team view
      default:
        return 'team';
    }
  };

  // Helper to build dashboard URL with employee context for reviewer-targeted notifications
  const buildEmployeeDeepLink = (view: string, empId: string, kpiId?: string | null, extraParams?: string) => {
    const params = new URLSearchParams();
    params.set('view', view);
    params.set('employee', empId);
    if (kpiId) params.set('kpi', kpiId);
    if (extraParams) {
      const extra = new URLSearchParams(extraParams);
      extra.forEach((v, k) => params.set(k, v));
    }
    return `/dashboard?${params.toString()}`;
  };

  // Helper for self-view KPI deep-link
  const selfKpiLink = (kpiId?: string | null, panel?: string) => {
    if (!kpiId) return '/dashboard';
    const params = new URLSearchParams();
    params.set('kpi', kpiId);
    if (panel) params.set('panel', panel);
    return `/dashboard?${params.toString()}`;
  };

  switch (item.notificationType) {
    // KPI workflow transitions — reviewer receives these about another employee
    case 'kpi_submitted':
      return metaEmployeeId
        ? buildEmployeeDeepLink('team', metaEmployeeId, item.kpiId)
        : (item.fromUser?.id ? buildEmployeeDeepLink('team', item.fromUser.id, item.kpiId) : selfKpiLink(item.kpiId));
    case 'kpi_ready_for_audit':
      return metaEmployeeId
        ? buildEmployeeDeepLink('audit', metaEmployeeId, item.kpiId)
        : (item.fromUser?.id ? buildEmployeeDeepLink('audit', item.fromUser.id, item.kpiId) : selfKpiLink(item.kpiId));
    case 'kpi_ready_for_management':
      return metaEmployeeId
        ? buildEmployeeDeepLink('management', metaEmployeeId, item.kpiId)
        : (item.fromUser?.id ? buildEmployeeDeepLink('management', item.fromUser.id, item.kpiId) : selfKpiLink(item.kpiId));

    // These are sent TO the employee about their own KPI — no employee param needed
    case 'kpi_approved':
    case 'kpi_finalized':
    case 'manager_rejected':
    case 'admin_status_step_back':
      return selfKpiLink(item.kpiId);

    // admin_status_change / admin_data_entry / admin_data_override:
    case 'admin_status_change':
    case 'admin_data_entry':
    case 'admin_data_override':
      if (metaEmployeeId && !isSelfTargeted) {
        return buildEmployeeDeepLink('team', metaEmployeeId, item.kpiId);
      }
      return selfKpiLink(item.kpiId);

    // KRA assignment — sent to the employee
    case 'kra_assigned':
    case 'kra_batch_assigned':
      return '/dashboard';

    // Query notifications → deep-link to KPI details with Query History dialog
    case 'query_raised':
    case 'query_resolved':
    case 'query_responded':
    case 'query_response_submitted':
    case 'query_resolved_fyi': {
      const queryEmployeeId = metaEmployeeId || item.fromUser?.id || null;
      const isOtherEmployee = queryEmployeeId && currentUserId && queryEmployeeId !== currentUserId;
      if (isOtherEmployee) {
        return buildEmployeeDeepLink('team', queryEmployeeId, item.kpiId, 'panel=queryHistory');
      }
      return selfKpiLink(item.kpiId, 'queryHistory');
    }

    // @Mentions — read-only mention sheet (unchanged)
    case 'observation_mention': {
      const obsKpiId = item.kpiId || (item.metadata as any)?.kpi_id || null;
      const obsEmployeeId = metaEmployeeId || (item.metadata as any)?.employee_id || item.fromUser?.id || null;
      if (obsKpiId && obsEmployeeId) {
        const params = new URLSearchParams();
        params.set('mentioned_kpi', obsKpiId);
        params.set('mentioned_employee', obsEmployeeId);
        return `/dashboard?${params.toString()}`;
      }
      if (obsKpiId) {
        return `/dashboard?mentioned_kpi=${obsKpiId}`;
      }
      return '/dashboard';
    }

    // Observation workflow (raised/reply/resolved) — role-aware deep-link
    case 'observation_raised':
    case 'observation_reply':
    case 'observation_resolved': {
      if (isSelfTargeted) {
        return selfKpiLink(item.kpiId);
      }
      // For reviewers/admins: open employee scorecard in role-appropriate view
      const obsEmployeeId = metaEmployeeId || (item.metadata as any)?.employee_id || item.fromUser?.id || null;
      if (obsEmployeeId) {
        const view = roleToView(currentRole);
        return buildEmployeeDeepLink(view, obsEmployeeId, item.kpiId);
      }
      // Fallback: if no employee context, open self KPI
      return selfKpiLink(item.kpiId);
    }

    // Period events
    case 'period_locked':
      return '/dashboard';

    // PIP
    case 'pip_initiated':
    case 'pip_completed':
    case 'pip_milestone_reminder':
      return '/admin/pip';

    // Password
    case 'password_rollout':
      return '/';

    // Rollback requests — reviewer receives these
    case 'rollback_requested': {
      const rbEmployeeId = metaEmployeeId || item.fromUser?.id || null;
      if (rbEmployeeId && !isSelfTargeted && item.kpiId) {
        return buildEmployeeDeepLink('team', rbEmployeeId, item.kpiId);
      }
      return selfKpiLink(item.kpiId);
    }
    case 'rollback_approved':
    case 'rollback_rejected':
      return selfKpiLink(item.kpiId);

    default:
      return null;
  }
}

export function filterInboxItems(items: InboxItem[], filters: InboxFiltersState): InboxItem[] {
  const parsed = parseSearchSyntax(filters.search);
  const textLower = parsed.plainText.toLowerCase();

  return items.filter(item => {
    // Text search
    if (textLower) {
      const searchable = [item.title, item.message, item.kpiName, item.kraName, item.fromUser?.fullName, item.toUser?.fullName, item.ticketNumber]
        .filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(textLower)) return false;
    }

    // Advanced syntax: type
    if (parsed.type && item.type !== parsed.type) return false;

    // Advanced syntax: status (queries only)
    if (parsed.status && item.queryStatus !== parsed.status) return false;

    // Advanced syntax: sla
    if (parsed.sla) {
      const sla = getItemSlaStatus(item);
      if (!sla || sla !== parsed.sla) return false;
    }

    // Advanced syntax: notiftype
    if (parsed.notificationType && item.notificationType !== parsed.notificationType) return false;

    // Dropdown: query status
    if (filters.queryStatus !== 'all' && item.queryStatus !== filters.queryStatus) return false;

    // Dropdown: SLA status
    if (filters.slaStatus !== 'all') {
      const sla = getItemSlaStatus(item);
      if (!sla || sla !== filters.slaStatus) return false;
    }

    // Dropdown: notification type
    if (filters.notificationType !== 'all' && item.notificationType !== filters.notificationType) return false;

    // Dropdown: date range
    if (filters.dateRange !== 'all') {
      const date = new Date(item.createdAt);
      const today = startOfToday();
      if (filters.dateRange === 'today' && !isToday(date)) return false;
      if (filters.dateRange === 'week' && !isAfter(date, startOfWeek(today, { weekStartsOn: 1 }))) return false;
      if (filters.dateRange === 'month' && !isAfter(date, startOfMonth(today))) return false;
    }

    // Dropdown: read status
    if (filters.readStatus === 'unread' && item.isRead) return false;
    if (filters.readStatus === 'read' && !item.isRead) return false;

    // Exclude currently-snoozed items from non-snoozed views (defense-in-depth)
    if (item.snoozedUntil && new Date(item.snoozedUntil) > new Date()) return false;

    return true;
  });
}
