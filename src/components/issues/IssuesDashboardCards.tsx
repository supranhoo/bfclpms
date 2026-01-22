import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, CheckCircle, TrendingDown } from 'lucide-react';
import { IssueSummary } from '@/hooks/useSystemIssues';

interface IssuesDashboardCardsProps {
  summary: IssueSummary;
}

export function IssuesDashboardCards({ summary }: IssuesDashboardCardsProps) {
  const cards = [
    {
      title: 'Total Open Issues',
      value: summary.totalOpen,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Critical / Overdue',
      value: summary.criticalOverdue,
      icon: Clock,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'Resolved This Week',
      value: summary.resolvedThisWeek,
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Avg Resolution (Days)',
      value: summary.avgResolutionDays || '—',
      icon: TrendingDown,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
