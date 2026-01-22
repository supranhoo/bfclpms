import { Badge } from '@/components/ui/badge';
import { PIPMilestone, MilestoneStatus } from '@/hooks/usePIP';
import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<MilestoneStatus, { icon: React.ElementType; color: string; bgColor: string }> = {
  pending: { icon: Circle, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  met: { icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  partially_met: { icon: Clock, color: 'text-warning', bgColor: 'bg-warning/10' },
  not_met: { icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10' },
};

interface MilestoneTrackerProps {
  milestones: PIPMilestone[];
  className?: string;
}

export function MilestoneTracker({ milestones, className }: MilestoneTrackerProps) {
  const sortedMilestones = [...milestones].sort(
    (a, b) => new Date(a.milestone_date).getTime() - new Date(b.milestone_date).getTime()
  );

  return (
    <div className={cn('relative', className)}>
      {/* Timeline Line */}
      <div className="absolute left-4 top-8 bottom-8 w-0.5 bg-border" />

      <div className="space-y-6">
        {sortedMilestones.map((milestone, index) => {
          const config = STATUS_CONFIG[milestone.status];
          const Icon = config.icon;
          const isLast = index === sortedMilestones.length - 1;

          return (
            <div key={milestone.id} className="relative flex gap-4">
              {/* Timeline Node */}
              <div className={cn(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background',
                config.bgColor
              )}>
                <Icon className={cn('h-4 w-4', config.color)} />
              </div>

              {/* Content */}
              <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{milestone.description}</span>
                  <Badge 
                    variant={milestone.status === 'met' ? 'default' : 
                            milestone.status === 'not_met' ? 'destructive' : 'outline'}
                    className="text-xs"
                  >
                    {milestone.status.replace('_', ' ')}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground mb-2">
                  Due: {format(new Date(milestone.milestone_date), 'MMM d, yyyy')}
                </p>

                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Expected: </span>
                    {milestone.expected_outcome}
                  </p>
                  {milestone.actual_outcome && (
                    <p>
                      <span className="text-muted-foreground">Actual: </span>
                      {milestone.actual_outcome}
                    </p>
                  )}
                  {milestone.remarks && (
                    <p className="text-xs italic text-muted-foreground">
                      "{milestone.remarks}"
                    </p>
                  )}
                </div>

                {milestone.reviewed_by && milestone.reviewed_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Reviewed on {format(new Date(milestone.reviewed_at), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
