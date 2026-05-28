import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { renderMentionText } from '@/lib/mentionUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
} from 'lucide-react';
import { format } from 'date-fns';
import { KpiObservation, ObservationType, ObserverRole, ObservationVisibility } from '@/hooks/useKpiObservations';
import { ObservationReplyThread } from './ObservationReplyThread';
import { cn } from '@/lib/utils';
import { isWithinEditWindow } from '@/lib/editWindow';

export type ObservationStatus = 'open' | 'acknowledged' | 'resolved';

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

const statusConfig: Record<ObservationStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700' },
  acknowledged: { label: 'Acknowledged', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-700' },
  resolved: { label: 'Resolved', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' },
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
  const withinEditWindow = isWithinEditWindow(observation.created_at);
  const canEditDelete = isCreator && !isReadOnly;
  const canEdit = canEditDelete && withinEditWindow;
  const hasDescription = observation.description && observation.description.length > 0;
  const status = ((observation as any).status as ObservationStatus) || 'open';
  const statusCfg = statusConfig[status];
  
  const observerName = observation.created_by_profile?.full_name || observation.created_by_profile?.email || 'Unknown';
  const formattedDate = format(new Date(observation.created_at), 'dd MMM yyyy');
  const editedAt = (observation as any).edited_at as string | null | undefined;

  // Evidence files (multi-file)
  const evidenceUrls: string[] = (observation as any).evidence_urls || [];
  const legacyUrl = observation.evidence_url;

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
            
            {(observation as any).ticket_number && (
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {(observation as any).ticket_number}
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-xs border', statusCfg.className)}>
              {statusCfg.label}
            </Badge>
            {observation.visibility === 'internal' && (
              <Badge variant="outline" className="text-xs border border-violet-300 dark:border-violet-700 bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 gap-1">
                <Lock className="h-3 w-3" />
                Internal
              </Badge>
            )}
          </div>

          {canEditDelete && (
            <div className="flex items-center gap-1">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => onEdit?.(observation)}
                  title="Edit (within 24h of posting)"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => onDelete?.(observation.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
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
          {editedAt && (
            <span className="italic" title={`Edited ${format(new Date(editedAt), 'dd MMM yyyy, HH:mm')}`}>
              (edited)
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-medium">{renderMentionText(observation.title)}</p>

        {/* Description (Expandable) */}
        {hasDescription && (
          <div>
            <p className={cn('text-sm text-muted-foreground', !isExpanded && 'line-clamp-2')}>
              {renderMentionText(observation.description!)}
            </p>
            {observation.description && observation.description.length > 100 && (
              <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded ? <><ChevronUp className="h-3 w-3 mr-1" />Show Less</> : <><ChevronDown className="h-3 w-3 mr-1" />Show More</>}
              </Button>
            )}
          </div>
        )}

        {/* Evidence Files */}
        {(evidenceUrls.length > 0 || legacyUrl) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {evidenceUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <FileText className="h-3 w-3" />
                Attachment {i + 1}
              </a>
            ))}
            {!evidenceUrls.length && legacyUrl && (
              <a
                href={legacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <FileText className="h-3 w-3" />
                View Evidence
              </a>
            )}
          </div>
        )}

        {/* Reply Thread */}
        {status !== 'resolved' ? (
          <ObservationReplyThread
            observationId={observation.id}
            kpiId={observation.kpi_id}
            observationCreatedBy={observation.created_by}
            isReadOnly={isReadOnly}
          />
        ) : (
          <ObservationReplyThread
            observationId={observation.id}
            kpiId={observation.kpi_id}
            observationCreatedBy={observation.created_by}
            isReadOnly={true}
          />
        )}
      </CardContent>
    </Card>
  );
}
