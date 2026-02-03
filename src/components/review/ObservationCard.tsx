import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { KpiObservation, ObservationType, ObserverRole } from '@/hooks/useKpiObservations';
import { cn } from '@/lib/utils';

interface ObservationCardProps {
  observation: KpiObservation;
  currentUserId: string;
  canApply: boolean;
  isReadOnly: boolean;
  onEdit?: (observation: KpiObservation) => void;
  onDelete?: (id: string) => void;
  onToggleApplied?: (id: string, isApplied: boolean) => void;
}

const typeConfig: Record<ObservationType, { icon: typeof TrendingUp; color: string; bgColor: string; label: string }> = {
  positive: {
    icon: TrendingUp,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    label: 'Positive',
  },
  concern: {
    icon: TrendingDown,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    label: 'Concern',
  },
  neutral: {
    icon: Minus,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30 border-border',
    label: 'Neutral',
  },
};

const roleLabels: Record<ObserverRole, string> = {
  self: 'Self',
  manager: 'Manager',
  auditor: 'Auditor',
  management: 'Management',
  admin: 'Admin',
};

export function ObservationCard({
  observation,
  currentUserId,
  canApply,
  isReadOnly,
  onEdit,
  onDelete,
  onToggleApplied,
}: ObservationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const config = typeConfig[observation.observation_type];
  const TypeIcon = config.icon;
  const isCreator = observation.created_by === currentUserId;
  const canEditDelete = isCreator && !isReadOnly;
  const hasDescription = observation.description && observation.description.length > 0;
  
  const observerName = observation.created_by_profile?.full_name || observation.created_by_profile?.email || 'Unknown';
  const formattedDate = format(new Date(observation.created_at), 'dd MMM yyyy');
  
  const impactText = observation.score_impact > 0
    ? `+${observation.score_impact}`
    : observation.score_impact.toString();

  return (
    <Card className={cn('border', config.bgColor)}>
      <CardContent className="p-3 space-y-2">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={cn('flex items-center gap-1', config.color)}>
              <TypeIcon className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">{config.label}</span>
            </div>
            
            {observation.score_impact !== 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  observation.score_impact > 0
                    ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400'
                    : 'border-red-300 text-red-700 dark:text-red-400'
                )}
              >
                {impactText} Score
              </Badge>
            )}
            
            <Badge
              variant={observation.is_applied ? 'default' : 'secondary'}
              className="text-xs"
            >
              {observation.is_applied ? 'Applied ✓' : 'Pending'}
            </Badge>
          </div>

          {/* Apply Toggle (for Management/Admin) */}
          {canApply && !isReadOnly && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Apply</span>
              <Switch
                checked={observation.is_applied}
                onCheckedChange={(checked) => onToggleApplied?.(observation.id, checked)}
                className="scale-75"
              />
            </div>
          )}
        </div>

        {/* Observer Info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs py-0">
            {roleLabels[observation.observer_role]}
          </Badge>
          <span>{observerName}</span>
          <span>•</span>
          <span>{formattedDate}</span>
        </div>

        {/* Title */}
        <p className="text-sm font-medium">{observation.title}</p>

        {/* Description (Expandable) */}
        {hasDescription && (
          <div>
            <p className={cn('text-sm text-muted-foreground', !isExpanded && 'line-clamp-2')}>
              {observation.description}
            </p>
            {observation.description && observation.description.length > 100 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-xs"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Show More
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Evidence & Actions */}
        <div className="flex items-center justify-between pt-1">
          {observation.evidence_url ? (
            <a
              href={observation.evidence_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View Evidence
            </a>
          ) : (
            <span />
          )}

          {canEditDelete && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => onEdit?.(observation)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={() => onDelete?.(observation.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Reviewed By Info */}
        {observation.is_applied && observation.reviewed_by_profile && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            Applied by {observation.reviewed_by_profile.full_name || observation.reviewed_by_profile.email}
            {observation.reviewed_at && ` on ${format(new Date(observation.reviewed_at), 'dd MMM yyyy')}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
