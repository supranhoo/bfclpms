/**
 * Shared stats cards component for review pages
 */

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LucideIcon } from 'lucide-react';

export interface StatCardConfig {
  label: string;
  value: number;
  description: string;
  icon: LucideIcon;
  color: 'amber' | 'purple' | 'green' | 'blue' | 'emerald';
  showProgress?: boolean;
  progressValue?: number;
}

const colorClasses = {
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    icon: 'text-purple-500',
  },
  green: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    icon: 'text-green-500',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    icon: 'text-blue-500',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: 'text-emerald-500',
  },
};

interface ReviewStatsCardsProps {
  stats: StatCardConfig[];
}

export function ReviewStatsCards({ stats }: ReviewStatsCardsProps) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-${Math.min(stats.length, 4)}`}>
      {stats.map((stat, index) => {
        const colors = colorClasses[stat.color];
        const Icon = stat.icon;
        
        return (
          <Card key={index} className="relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-20 h-20 ${colors.bg} rounded-full -mr-10 -mt-10`} />
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className={`text-3xl font-bold ${colors.text}`}>
                    {stat.showProgress ? `${stat.value}%` : stat.value}
                  </p>
                  {stat.showProgress && stat.progressValue !== undefined ? (
                    <Progress value={stat.progressValue} className="h-1.5 mt-2" />
                  ) : (
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  )}
                </div>
                <div className={`h-10 w-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
