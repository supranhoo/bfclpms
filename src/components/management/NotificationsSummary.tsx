import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useUnreadNotificationCount } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

export function NotificationsSummary() {
  const navigate = useNavigate();
  const { data: notifications } = useNotifications();
  const { data: unreadCount } = useUnreadNotificationCount();

  const recent = (notifications || []).slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5" />
              Notifications
              {(unreadCount || 0) > 0 && (
                <Badge variant="destructive" className="text-xs ml-1">
                  {unreadCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Recent alerts & reminders</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/inbox')}>
            View All <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No notifications</p>
        ) : (
          <ScrollArea className="h-[250px]">
            <div className="space-y-3">
              {recent.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 text-sm rounded-lg p-2 ${!n.is_read ? 'bg-muted/50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
