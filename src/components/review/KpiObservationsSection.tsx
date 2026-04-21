import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquarePlus, 
  Eye,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { 
  KpiObservation, 
  ObserverRole,
  useKpiObservations,
  useCreateObservation,
  useUpdateObservation,
  useDeleteObservation,
  CreateObservationInput,
} from '@/hooks/useKpiObservations';
import { ObservationCard } from './ObservationCard';
import { AddObservationDialog } from './AddObservationDialog';
import { useAuth } from '@/contexts/AuthContext';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface KpiObservationsSectionProps {
  kpiId: string;
  kpiStatus: string;
  viewLevel: 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' | 'admin';
  baseScore?: number | null;
  isOwnKpi?: boolean;
  /** v2.65.0 — Explorer Mode: hide all add/edit affordances, render observations as read-only */
  exploreMode?: boolean;
}

function getObserverRole(viewLevel: string, isOwnKpi: boolean): ObserverRole {
  if (isOwnKpi && viewLevel === 'employee') return 'self';
  switch (viewLevel) {
    case 'manager': return 'manager';
    case 'skip_level': return 'manager';
    case 'hr_pms': return 'manager';
    case 'auditor': return 'auditor';
    case 'management': return 'management';
    case 'admin': return 'admin';
    default: return 'self';
  }
}

function canAddObservation(viewLevel: string, _kpiStatus: string, isOwnKpi: boolean): boolean {
  if (isOwnKpi) return true;
  return ['manager', 'skip_level', 'hr_pms', 'auditor', 'management', 'admin'].includes(viewLevel);
}

function isAutoApply(viewLevel: string): boolean {
  return viewLevel === 'management';
}

export function KpiObservationsSection({
  kpiId,
  kpiStatus,
  viewLevel,
  baseScore,
  isOwnKpi = false,
  exploreMode = false,
}: KpiObservationsSectionProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingObservation, setEditingObservation] = useState<KpiObservation | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: observations = [], isLoading } = useKpiObservations(kpiId);
  const createMutation = useCreateObservation();
  const updateMutation = useUpdateObservation();
  const deleteMutation = useDeleteObservation();

  const isReadOnly = exploreMode;
  const observerRole = getObserverRole(viewLevel, isOwnKpi);
  const showAddButton = !exploreMode && canAddObservation(viewLevel, kpiStatus, isOwnKpi);
  const autoApply = isAutoApply(viewLevel);

  // Status counts
  const openCount = observations.filter(o => ((o as any).status || 'open') === 'open').length;
  const acknowledgedCount = observations.filter(o => (o as any).status === 'acknowledged').length;
  const resolvedCount = observations.filter(o => (o as any).status === 'resolved').length;

  const handleSubmit = (data: CreateObservationInput | { id: string } & Partial<CreateObservationInput>) => {
    if ('id' in data && data.id) {
      updateMutation.mutate(data as { id: string } & Partial<CreateObservationInput>);
    } else {
      createMutation.mutate(data as CreateObservationInput);
    }
    setEditingObservation(null);
  };

  const handleEdit = (observation: KpiObservation) => {
    setEditingObservation(observation);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate({ id: deleteConfirmId, kpiId });
      setDeleteConfirmId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Observations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const positiveCount = observations.filter(o => o.observation_type === 'positive').length;
  const concernCount = observations.filter(o => o.observation_type === 'concern').length;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Observations
              {observations.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {observations.length}
                </Badge>
              )}
            </CardTitle>
            
            {showAddButton && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingObservation(null);
                  setDialogOpen(true);
                }}
              >
                <MessageSquarePlus className="h-4 w-4 mr-1" />
                Add Observation
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Summary Stats */}
          {observations.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2 border-b">
              {positiveCount > 0 && (
                <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {positiveCount} Positive
                </Badge>
              )}
              {concernCount > 0 && (
                <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-400">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {concernCount} Concern
                </Badge>
              )}
              {openCount > 0 && (
                <Badge variant="outline" className="border-yellow-300 text-yellow-700 dark:text-yellow-400">
                  {openCount} Open
                </Badge>
              )}
              {resolvedCount > 0 && (
                <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400">
                  {resolvedCount} Resolved
                </Badge>
              )}
            </div>
          )}

          {/* Observation List */}
          {observations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No observations recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {observations.map((observation) => (
                <ObservationCard
                  key={observation.id}
                  observation={observation}
                  currentUserId={user?.id || ''}
                  canApply={false}
                  isReadOnly={isReadOnly}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <AddObservationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kpiId={kpiId}
        observerRole={observerRole}
        autoApply={autoApply}
        editingObservation={editingObservation}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Observation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this observation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
