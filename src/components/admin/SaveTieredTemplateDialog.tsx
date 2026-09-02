/** ADR-339 — Save the current tiered option set as a reusable template. */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { QualitativeOption } from '@/lib/qualitativeUom';
import { useSaveTieredTemplate, useTieredTemplates } from '@/hooks/useTieredTemplates';
import { findTemplateByName, validateTemplateInput } from '@/services/kpi/tieredTemplateService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: QualitativeOption[];
}

export function SaveTieredTemplateDialog({ open, onOpenChange, options }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { data: templates = [] } = useTieredTemplates();
  const save = useSaveTieredTemplate();

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
    }
  }, [open]);

  const existing = findTemplateByName(templates, name);
  const error = name.trim() ? validateTemplateInput(name, options) : null;

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        id: existing?.id ?? null,
        name,
        description,
        options,
      });
      onOpenChange(false);
    } catch {
      /* toast handled by the hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            The saved tier set becomes available in the "Use template" list for any KPI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Template name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production Incentive tiers"
            />
            {existing && (
              <p className="text-xs text-amber-600">
                A template with this name already exists — saving will overwrite it.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When should this tier set be used?"
            />
          </div>

          <div className="rounded-md border p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-muted-foreground">Tiers being saved</p>
            {[...options]
              .sort((a, b) => b.rating - a.rating)
              .map((o, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary" className="px-1.5">R{o.rating}</Badge>
                  <span>{o.label || '(no label)'}</span>
                </div>
              ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !!error || save.isPending}>
            {existing ? 'Overwrite template' : 'Save template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
