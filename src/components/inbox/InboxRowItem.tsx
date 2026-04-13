import { Bell, MessageSquare, Send, CheckCircle2, Clock, AlertCircle, CheckCheck, ExternalLink, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getNotificationNavigationPath } from '@/lib/inboxUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableRow, TableCell } from '@/components/ui/table';
import { InboxItem, formatRelativeTime, getQueryStatusClasses, getQuickAction } from '@/lib/inboxUtils';
import { cn } from '@/lib/utils';
import { SnoozePopover } from './SnoozePopover';

interface InboxRowItemProps {
  item: InboxItem;
  onView: (item: InboxItem) => void;
  onMarkRead?: (item: InboxItem) => void;
  onNavigate?: (path: string) => void;
  onToggleExpand?: (itemId: string) => void;
  isExpanded?: boolean;
  currentUserId?: string;
  currentRole?: string;
  onSnooze?: (notificationId: string, until: Date) => void;
  onUnsnooze?: (notificationId: string) => void;
  isSnoozing?: boolean;
  showSnoozedInfo?: boolean;
}

export function InboxRowItem({ item, onView, onMarkRead, onNavigate, onToggleExpand, isExpanded, currentUserId, currentRole, onSnooze, onUnsnooze, isSnoozing, showSnoozedInfo }: InboxRowItemProps) {
  const getTypeIcon = () => {
    if (item.type === 'query') {
      switch (item.queryStatus) {
        case 'open':
          return <Clock className="h-4 w-4 text-orange-500" />;
        case 'responded':
          return <MessageCircle className="h-4 w-4 text-amber-500" />;
        case 'resolved':
          return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        default:
          return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
      }
    }

    // Notification types
    switch (item.notificationType) {
      case 'kpi_submitted':
        return <Send className="h-4 w-4 text-blue-500" />;
      case 'kpi_approved':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'kpi_finalized':
        return <CheckCheck className="h-4 w-4 text-purple-500" />;
      case 'kpi_ready_for_audit':
      case 'kpi_ready_for_management':
        return <Bell className="h-4 w-4 text-yellow-500" />;
      case 'query_raised':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'query_resolved':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleRowClick = () => {
    if (!item.isRead && onMarkRead) {
      onMarkRead(item);
    }
    // Always open the detail sheet first; navigation happens via "Open in App" button inside
    onView(item);
  };

  const quickAction = currentUserId ? getQuickAction(item, currentUserId) : null;

  return (
    <TableRow
      className={cn(
        'cursor-pointer transition-colors',
        !item.isRead && 'bg-primary/5 hover:bg-primary/10',
        item.isRead && 'hover:bg-muted/50',
        isExpanded && 'bg-muted/30'
      )}
      onClick={handleRowClick}
    >
      {/* Unread Indicator */}
      <TableCell className="w-8 px-2">
        {!item.isRead && (
          <div className="h-2 w-2 rounded-full bg-primary" title="Unread" />
        )}
      </TableCell>

      {/* Type Icon */}
      <TableCell className="w-10 px-2">
        {getTypeIcon()}
      </TableCell>

      {/* Title & Message */}
      <TableCell className="max-w-0">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {item.ticketNumber && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-mono">
                {item.ticketNumber}
              </Badge>
            )}
            <span className={cn('font-medium truncate', !item.isRead && 'text-foreground', item.isRead && 'text-muted-foreground')}>
              {item.title}
            </span>
          </div>
          <span className="text-sm text-muted-foreground truncate">
            {item.message}
          </span>
        </div>
      </TableCell>

      {/* Status Badge (for queries) */}
      <TableCell className="w-28 hidden md:table-cell">
        {item.type === 'query' && item.queryStatus && (
          <Badge variant="outline" className={cn('text-xs', getQueryStatusClasses(item.queryStatus))}>
            {item.queryStatus === 'open' && 'Open'}
            {item.queryStatus === 'responded' && 'Responded'}
            {item.queryStatus === 'resolved' && 'Resolved'}
          </Badge>
        )}
        {item.type === 'notification' && (
          <Badge
            variant="outline"
            className={cn('text-xs cursor-pointer hover:bg-muted transition-colors', item.isRead ? 'text-muted-foreground' : 'text-primary border-primary')}
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead?.(item);
            }}
          >
            {item.isRead ? 'Read' : 'Unread'}
          </Badge>
        )}
      </TableCell>

      {/* From User */}
      <TableCell className="w-32 hidden lg:table-cell">
        <span className="text-sm text-muted-foreground truncate block">
          {item.fromUser?.fullName || item.fromUser?.email || '—'}
        </span>
      </TableCell>

      {/* Time */}
      <TableCell className="w-28 text-right">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(item.createdAt)}
        </span>
      </TableCell>

      {/* Actions */}
      <TableCell className="w-32 px-2">
        <div className="flex items-center gap-1 justify-end">
          {/* Snooze count badge */}
          {(item.snoozeCount || 0) >= 2 && !showSnoozedInfo && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground">
              Snoozed x{item.snoozeCount}
            </Badge>
          )}
          {/* Un-snooze button for snoozed tab */}
          {showSnoozedInfo && onUnsnooze && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={(e) => {
                e.stopPropagation();
                onUnsnooze(item.id);
              }}
            >
              Un-snooze
            </Button>
          )}
          {/* Quick Action Button */}
          {quickAction && onToggleExpand && (
            <Button
              variant={isExpanded ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(item.id);
              }}
            >
              {quickAction.label}
              {isExpanded ? (
                <ChevronUp className="h-3 w-3 ml-1" />
              ) : (
                <ChevronDown className="h-3 w-3 ml-1" />
              )}
            </Button>
          )}
          {/* Snooze */}
          {item.type === 'notification' && onSnooze && !showSnoozedInfo && (
            <SnoozePopover
              onSnooze={(until) => onSnooze(item.id, until)}
              isLoading={isSnoozing}
            />
          )}
          {/* View Details */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Open in App"
            onClick={(e) => {
              e.stopPropagation();
              const path = getNotificationNavigationPath(item, currentUserId, currentRole);
              if (path && onNavigate) {
                if (!item.isRead && onMarkRead) onMarkRead(item);
                onNavigate(path);
              } else {
                onView(item);
              }
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
