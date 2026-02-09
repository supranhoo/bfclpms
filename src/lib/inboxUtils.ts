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
  };
  return labels[type] || type;
}

/**
 * Get query status color classes
 */
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
export function filterInboxItems(items: InboxItem[], filters: InboxFiltersState): InboxItem[] {
  const parsed = parseSearchSyntax(filters.search);
  const textLower = parsed.plainText.toLowerCase();

  return items.filter(item => {
    // Text search
    if (textLower) {
      const searchable = [item.title, item.message, item.kpiName, item.kraName, item.fromUser?.fullName, item.toUser?.fullName]
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

    return true;
  });
}
