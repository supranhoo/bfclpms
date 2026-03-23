import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface Props {
  fiscalStartYear: number;
  selectedMonths: string[];
}

export function NotificationsSummary({ fiscalStartYear, selectedMonths }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Compute date range from selected months
  const dateRange = (() => {
    const pairs = selectedMonths.map(month => {
      const monthIndex = MONTHS.indexOf(month);
      const calendarYear = monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1;
      return { monthIndex, calendarYear };
    });
    if (pairs.length === 0) return null;
    const sorted = [...pairs].sort((a, b) => a.calendarYear - b.calendarYear || a.monthIndex - b.monthIndex);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const startDate = new Date(first.calendarYear, first.monthIndex, 1).toISOString();
    const endDate = new Date(last.calendarYear, last.monthIndex + 1, 0, 23, 59, 59).toISOString();
    return { startDate, endDate };
  })();

  const { data: notifications } = useQuery({
    queryKey: ['notifications-summary', user?.id, fiscalStartYear, selectedMonths],
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (dateRange) {
        query = query.gte('created_at', dateRange.startDate).lte('created_at', dateRange.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications-summary-unread', user?.id, fiscalStartYear, selectedMonths],
    queryFn: async () => {
      if (!user?.id) return 0;
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (dateRange) {
        query = query.gte('created_at', dateRange.startDate).lte('created_at', dateRange.endDate);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
  });

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
              {recent.map((n: any) => (
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
