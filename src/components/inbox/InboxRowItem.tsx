import { Bell, MessageSquare, Send, CheckCircle2, Clock, AlertCircle, CheckCheck, ExternalLink, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableRow, TableCell } from '@/components/ui/table';
import { InboxItem, formatRelativeTime, getQueryStatusClasses } from '@/lib/inboxUtils';
import { cn } from '@/lib/utils';

interface InboxRowItemProps {
  item: InboxItem;
  onView: (item: InboxItem) => void;
  onMarkRead?: (item: InboxItem) => void;
}

export function InboxRowItem({ item, onView, onMarkRead }: InboxRowItemProps) {
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
  };

  return (
    <TableRow
      className={cn(
        'cursor-pointer transition-colors',
        !item.isRead && 'bg-primary/5 hover:bg-primary/10',
        item.isRead && 'hover:bg-muted/50'
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
          <span className={cn('font-medium truncate', !item.isRead && 'text-foreground', item.isRead && 'text-muted-foreground')}>
            {item.title}
          </span>
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
      <TableCell className="w-12 px-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onView(item);
          }}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
