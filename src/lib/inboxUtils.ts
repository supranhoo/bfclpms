import { isToday, isAfter, isBefore, startOfWeek, startOfToday, formatDistanceToNow } from 'date-fns';

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
