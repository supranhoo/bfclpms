import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ObservationType, 
  ObserverRole, 
  KpiObservation,
  CreateObservationInput,
} from '@/hooks/useKpiObservations';
import { cn } from '@/lib/utils';

interface AddObservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiId: string;
  observerRole: ObserverRole;
  autoApply: boolean;
  editingObservation?: KpiObservation | null;
  onSubmit: (data: CreateObservationInput | { id: string } & Partial<CreateObservationInput>) => void;
  isLoading?: boolean;
}

const typeOptions: { value: ObservationType; label: string; icon: typeof TrendingUp; description: string }[] = [
  { value: 'positive', label: 'Positive', icon: TrendingUp, description: 'Achievement or exceptional performance' },
  { value: 'concern', label: 'Concern', icon: TrendingDown, description: 'Issue that needs attention' },
  { value: 'neutral', label: 'Neutral', icon: Minus, description: 'General observation or note' },
];

export function AddObservationDialog({
  open,
  onOpenChange,
  kpiId,
  observerRole,
  autoApply,
  editingObservation,
  onSubmit,
  isLoading,
}: AddObservationDialogProps) {
  const { user } = useAuth();
  const isEditing = !!editingObservation;
  
  const [observationType, setObservationType] = useState<ObservationType>('neutral');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);

  useEffect(() => {
    if (editingObservation) {
      setObservationType(editingObservation.observation_type);
      setTitle(editingObservation.title);
      setDescription(editingObservation.description || '');
      setEvidenceUrls((editingObservation as any).evidence_urls || []);
    } else {
      setObservationType('neutral');
      setTitle('');
      setDescription('');
      setEvidenceUrls([]);
    }
  }, [editingObservation, open]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setObservationType(editingObservation?.observation_type || 'neutral');
      setTitle(editingObservation?.title || '');
      setDescription(editingObservation?.description || '');
      setEvidenceUrls((editingObservation as any)?.evidence_urls || []);
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    
    if (isEditing && editingObservation) {
      onSubmit({
        id: editingObservation.id,
        observation_type: observationType,
        score_impact: 0,
        title: title.trim(),
        description: description.trim() || undefined,
        evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
      } as any);
    } else {
      onSubmit({
        kpi_id: kpiId,
        observer_role: observerRole,
        observation_type: observationType,
        score_impact: 0,
        title: title.trim(),
        description: description.trim() || undefined,
        evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
        is_applied: autoApply,
      } as any);
    }
    
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Observation' : 'Add Observation'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update your observation details below.'
              : 'Add an observation that will be visible throughout the review process.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Observation Type */}
          <div className="space-y-2">
            <Label>Observation Type</Label>
            <RadioGroup
              value={observationType}
              onValueChange={(val) => setObservationType(val as ObservationType)}
              className="grid grid-cols-3 gap-2"
            >
              {typeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = observationType === option.value;
                return (
                  <div key={option.value}>
                    <RadioGroupItem value={option.value} id={option.value} className="sr-only" />
                    <Label
                      htmlFor={option.value}
                      className={cn(
                        'flex flex-col items-center gap-1 p-3 rounded-lg border-2 cursor-pointer transition-colors',
                        isSelected
                          ? option.value === 'positive'
                            ? 'border-primary bg-primary/10'
                            : option.value === 'concern'
                            ? 'border-destructive bg-destructive/10'
                            : 'border-primary bg-muted'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5',
                          option.value === 'positive' && 'text-primary',
                          option.value === 'concern' && 'text-destructive',
                          option.value === 'neutral' && 'text-muted-foreground'
                        )}
                      />
                      <span className="text-sm font-medium">{option.label}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief observation title..."
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details about this observation..."
              rows={3}
            />
          </div>

          {/* Evidence Upload */}
          {user && (
            <MultiFileUpload
              userId={user.id}
              contextId={kpiId}
              folder="observation-evidence"
              existingUrls={evidenceUrls}
              onUploadComplete={setEvidenceUrls}
              maxFiles={5}
              label="Evidence (Optional)"
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || isLoading}>
            {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Observation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
