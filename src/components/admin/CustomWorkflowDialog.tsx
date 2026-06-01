import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  useCreateWorkflowTemplate, 
  useUpdateWorkflowTemplate, 
  getStageLabel,
  type WorkflowTemplate 
} from '@/hooks/useWorkflowConfig';

const MASTER_ORDER = [
  'kra_set',
  'self_review',
  'manager_check',
  'functional_manager_check',
  'skip_level_check',
  'hr_pms_review',
  'audit',
  'management_review',
  'approved',
] as const;

const FIXED_STAGES = new Set(['kra_set', 'self_review', 'approved']);

const DEFAULT_ON_STAGES = new Set(['manager_check', 'audit', 'management_review']);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTemplate?: WorkflowTemplate | null;
}

export default function CustomWorkflowDialog({ open, onOpenChange, editTemplate }: Props) {
  const { toast } = useToast();
  const createTemplate = useCreateWorkflowTemplate();
  const updateTemplate = useUpdateWorkflowTemplate();

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  // Initialize state when dialog opens or editTemplate changes
  useEffect(() => {
    if (open) {
      if (editTemplate) {
        setDisplayName(editTemplate.display_name);
        setDescription(editTemplate.description || '');
        const t: Record<string, boolean> = {};
        MASTER_ORDER.forEach(stage => {
          if (FIXED_STAGES.has(stage)) {
            t[stage] = true;
          } else {
            t[stage] = editTemplate.stages.includes(stage);
          }
        });
        setToggles(t);
      } else {
        setDisplayName('');
        setDescription('');
        const t: Record<string, boolean> = {};
        MASTER_ORDER.forEach(stage => {
          t[stage] = FIXED_STAGES.has(stage) || DEFAULT_ON_STAGES.has(stage);
        });
        setToggles(t);
      }
    }
  }, [open, editTemplate]);

  const selectedStages = useMemo(
    () => MASTER_ORDER.filter(s => toggles[s]),
    [toggles]
  );

  const optionalCount = selectedStages.filter(s => !FIXED_STAGES.has(s)).length;

  const nameSlug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const isValid = displayName.trim().length > 0 && optionalCount >= 1 && nameSlug.length > 0;

  const handleToggle = (stage: string, checked: boolean) => {
    setToggles(prev => ({ ...prev, [stage]: checked }));
  };

  const handleSave = async () => {
    if (!isValid) return;
    try {
      if (editTemplate) {
        await updateTemplate.mutateAsync({
          id: editTemplate.id,
          name: nameSlug,
          displayName: displayName.trim(),
          description: description.trim() || undefined,
          stages: [...selectedStages],
        });
        toast({ title: 'Template updated' });
      } else {
        await createTemplate.mutateAsync({
          name: nameSlug,
          displayName: displayName.trim(),
          description: description.trim() || undefined,
          stages: [...selectedStages],
        });
        toast({ title: 'Template created' });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message?.includes('duplicate')
          ? 'A template with this name already exists.'
          : err?.message || 'Failed to save template.',
        variant: 'destructive',
      });
    }
  };

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editTemplate ? 'Edit Workflow Template' : 'Create Custom Workflow'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Name */}
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              placeholder="e.g. Sales Team Workflow"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="template-desc">Description</Label>
            <Textarea
              id="template-desc"
              placeholder="Optional description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Stage Selector */}
          <div className="space-y-1.5">
            <Label>Review Stages</Label>
            <div className="border rounded-lg divide-y">
              {MASTER_ORDER.map(stage => {
                const isFixed = FIXED_STAGES.has(stage);
                return (
                  <div
                    key={stage}
                    className="flex items-center justify-between px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      {isFixed && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className={`text-sm ${isFixed ? 'text-muted-foreground' : ''}`}>
                        {getStageLabel(stage)}
                      </span>
                    </div>
                    <Switch
                      checked={!!toggles[stage]}
                      onCheckedChange={checked => handleToggle(stage, checked)}
                      disabled={isFixed}
                    />
                  </div>
                );
              })}
            </div>
            {optionalCount === 0 && (
              <p className="text-xs text-destructive">
                Select at least one optional review stage.
              </p>
            )}
          </div>

          {/* Live Preview */}
          <div className="space-y-1.5">
            <Label>Workflow Preview</Label>
            <div className="flex items-center gap-1 flex-wrap p-3 border rounded-lg bg-muted/30">
              {selectedStages.map((stage, i) => (
                <div key={stage} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">
                    {getStageLabel(stage)}
                  </Badge>
                  {i < selectedStages.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? 'Saving…' : editTemplate ? 'Update Template' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
