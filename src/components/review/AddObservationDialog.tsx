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
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TrendingUp, TrendingDown, Minus, Link } from 'lucide-react';
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
  autoApply: boolean; // true for Management/Admin
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
  const isEditing = !!editingObservation;
  
  const [observationType, setObservationType] = useState<ObservationType>('neutral');
  const [scoreImpact, setScoreImpact] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  // Reset form when editing observation changes
  useEffect(() => {
    if (editingObservation) {
      setObservationType(editingObservation.observation_type);
      setScoreImpact(editingObservation.score_impact);
      setTitle(editingObservation.title);
      setDescription(editingObservation.description || '');
      setEvidenceUrl(editingObservation.evidence_url || '');
    } else {
      setObservationType('neutral');
      setScoreImpact(0);
      setTitle('');
      setDescription('');
      setEvidenceUrl('');
    }
  }, [editingObservation, open]);

  const resetForm = () => {
    setObservationType(editingObservation?.observation_type || 'neutral');
    setScoreImpact(editingObservation?.score_impact || 0);
    setTitle(editingObservation?.title || '');
    setDescription(editingObservation?.description || '');
    setEvidenceUrl(editingObservation?.evidence_url || '');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    
    if (isEditing && editingObservation) {
      onSubmit({
        id: editingObservation.id,
        observation_type: observationType,
        score_impact: scoreImpact,
        title: title.trim(),
        description: description.trim() || undefined,
        evidence_url: evidenceUrl.trim() || undefined,
      });
    } else {
      onSubmit({
        kpi_id: kpiId,
        observer_role: observerRole,
        observation_type: observationType,
        score_impact: scoreImpact,
        title: title.trim(),
        description: description.trim() || undefined,
        evidence_url: evidenceUrl.trim() || undefined,
        is_applied: autoApply,
      });
    }
    
    handleOpenChange(false);
  };

  // Suggest score impact based on type
  const handleTypeChange = (type: ObservationType) => {
    setObservationType(type);
    if (scoreImpact === 0) {
      if (type === 'positive') setScoreImpact(1);
      else if (type === 'concern') setScoreImpact(-1);
    }
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
            {autoApply && (
              <span className="block mt-1 text-primary font-medium">
                Your observations will be auto-applied to the score.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Observation Type */}
          <div className="space-y-2">
            <Label>Observation Type</Label>
            <RadioGroup
              value={observationType}
              onValueChange={(val) => handleTypeChange(val as ObservationType)}
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

          {/* Score Impact */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Score Impact</Label>
              <span
                className={cn(
                  'text-sm font-medium',
                  scoreImpact > 0 && 'text-primary',
                  scoreImpact < 0 && 'text-destructive',
                  scoreImpact === 0 && 'text-muted-foreground'
                )}
              >
                {scoreImpact > 0 ? '+' : ''}{scoreImpact}
              </span>
            </div>
            <Slider
              value={[scoreImpact]}
              onValueChange={([val]) => setScoreImpact(val)}
              min={-5}
              max={5}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-5 (Major Issue)</span>
              <span>0 (No Impact)</span>
              <span>+5 (Exceptional)</span>
            </div>
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

          {/* Evidence URL */}
          <div className="space-y-2">
            <Label htmlFor="evidenceUrl">Evidence URL (Optional)</Label>
            <div className="flex items-center gap-2">
              <Link className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                id="evidenceUrl"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://..."
                type="url"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Link to supporting evidence (document, screenshot, etc.)
            </p>
          </div>
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
