import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, RotateCcw, HelpCircle, ArrowRight, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ActionItemsCardsProps {
  overdueReviews: number;
  pendingRollbacks: number;
  openQueries: number;
  pendingIncentiveAdjustments?: number;
}

export function ActionItemsCards({ overdueReviews, pendingRollbacks, openQueries }: ActionItemsCardsProps) {
  const navigate = useNavigate();

  const items = [
    {
      title: 'Overdue Reviews',
      count: overdueReviews,
      icon: Clock,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      onClick: () => navigate('/reports/bottleneck'),
    },
    {
      title: 'Pending Rollbacks',
      count: pendingRollbacks,
      icon: RotateCcw,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      onClick: () => navigate('/admin/rollback-requests'),
    },
    {
      title: 'Open Queries',
      count: openQueries,
      icon: HelpCircle,
      color: 'text-destructive',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      onClick: () => navigate('/reports/queries'),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Action Items & Approvals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.title}
              onClick={item.onClick}
              className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className={`rounded-md p-2 ${item.bgColor}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{item.title}</p>
                <p className="text-lg font-bold">{item.count}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
