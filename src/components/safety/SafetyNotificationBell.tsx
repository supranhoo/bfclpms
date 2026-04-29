import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useSafetyNotifications,
  useMarkSafetyNotificationRead,
  useMarkAllSafetyNotificationsRead,
  type SafetyNotification,
} from '@/hooks/useSafetyNotifications';
import { cn } from '@/lib/utils';

/**
 * SafetyNotificationBell
 * ----------------------
 * In-app bell for the Safety shell. Lists the 50 most recent notifications
 * for the signed-in user with unread count badge. Click navigates to the
 * underlying incident.
 */
export function SafetyNotificationBell() {
  const navigate = useNavigate();
  const { data, unreadCount, isLoading } = useSafetyNotifications();
  const markRead = useMarkSafetyNotificationRead();
  const markAll = useMarkAllSafetyNotificationsRead();
  const items = data ?? [];

  const onItemClick = (n: SafetyNotification) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.incident_id) navigate(`/safety/incidents/${n.incident_id}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Safety notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] leading-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <p className="text-sm font-semibold">Safety notifications</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={unreadCount === 0 || markAll.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Mark all
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'p-3 cursor-pointer hover:bg-accent/50 transition-colors',
                    !n.is_read && 'bg-accent/30',
                  )}
                  onClick={() => onItemClick(n)}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1 h-2 w-2 rounded-full flex-shrink-0',
                        n.is_read ? 'bg-transparent' : 'bg-destructive',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}