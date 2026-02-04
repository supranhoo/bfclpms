import { Bell, Clock, CheckCircle2, Send, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatItem {
  label: string;
  value: number;
  sublabel?: string;
  color: 'primary' | 'orange' | 'green' | 'blue' | 'amber';
  icon: React.ReactNode;
}

interface InboxStatsCardsProps {
  stats: StatItem[];
}

const colorClasses = {
  primary: {
    border: 'border-l-primary',
    text: 'text-primary',
    bg: 'bg-primary/10',
  },
  orange: {
    border: 'border-l-orange-500',
    text: 'text-orange-600',
    bg: 'bg-orange-500/10',
  },
  green: {
    border: 'border-l-green-500',
    text: 'text-green-600',
    bg: 'bg-green-500/10',
  },
  blue: {
    border: 'border-l-blue-500',
    text: 'text-blue-600',
    bg: 'bg-blue-500/10',
  },
  amber: {
    border: 'border-l-amber-500',
    text: 'text-amber-600',
    bg: 'bg-amber-500/10',
  },
};

export function InboxStatsCards({ stats }: InboxStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat, index) => {
        const colors = colorClasses[stat.color];
        return (
          <Card key={index} className={cn('border-l-4', colors.border)}>
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className={cn('text-xl sm:text-3xl font-bold', colors.text)}>{stat.value}</p>
                  {stat.sublabel && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{stat.sublabel}</p>
                  )}
                </div>
                <div className={cn('h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center', colors.bg)}>
                  {stat.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Helper to build stats from inbox data
export function buildInboxStats(params: {
  unreadCount: number;
  openQueriesCount: number;
  resolvedQueriesCount: number;
  sentQueriesCount: number;
  pendingAcceptanceCount?: number;
}) {
  return [
    {
      label: 'Unread',
      value: params.unreadCount,
      sublabel: 'New notifications',
      color: 'primary' as const,
      icon: <Bell className="h-6 w-6 text-primary" />,
    },
    {
      label: 'Open Queries',
      value: params.openQueriesCount,
      sublabel: 'Awaiting response',
      color: 'orange' as const,
      icon: <Clock className="h-6 w-6 text-orange-500" />,
    },
    {
      label: 'Resolved',
      value: params.resolvedQueriesCount,
      sublabel: 'Queries resolved',
      color: 'green' as const,
      icon: <CheckCircle2 className="h-6 w-6 text-green-500" />,
    },
    {
      label: 'Sent',
      value: params.sentQueriesCount,
      sublabel: params.pendingAcceptanceCount ? `${params.pendingAcceptanceCount} pending acceptance` : 'Queries raised',
      color: 'blue' as const,
      icon: <Send className="h-6 w-6 text-blue-500" />,
    },
  ];
}
