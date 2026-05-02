import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useEditDefinition, KpiDefinition } from '@/hooks/useKpiRegistry';

interface Props {
  open: boolean;
  onClose: () => void;
  definition: KpiDefinition | null;
  onSaved?: () => void;
}

export function EditDefinitionDialog({ open, onClose, definition, onSaved }: Props) {
  const { editDefinition, saving } = useEditDefinition();
  const [kra, setKra] = useState('');
  const [kpi, setKpi] = useState('');

  useEffect(() => {
    if (definition) {
      setKra(definition.canonical_kra_name);
      setKpi(definition.canonical_kpi_name);
    }
  }, [definition]);

  const handleSave = async () => {
    if (!definition) return;
    if (!kra.trim() || !kpi.trim()) return;
    // Phase 5c: edits always propagate to May-2026+ linked rows. The flag
    // is retained in the API for compatibility but is no longer user-tunable.
    const ok = await editDefinition(definition.id, kra, kpi, true);
    if (ok) {
      onSaved?.();
      onClose();
    }
  };

  const dirty = definition && (kra.trim() !== definition.canonical_kra_name || kpi.trim() !== definition.canonical_kpi_name);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Canonical Definition</DialogTitle>
          <DialogDescription>
            Rename the canonical KRA / KPI for this registry entry. The new
            text is always pushed down to every linked KPI row from May 2026
            onward so it appears on the user dashboard immediately. Past data
            (before May 2026) is never modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Canonical KRA Name</Label>
            <Input value={kra} onChange={e => setKra(e.target.value)} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label>Canonical KPI Name</Label>
            <Textarea value={kpi} onChange={e => setKpi(e.target.value)} maxLength={2000} rows={3} />
          </div>

          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Saving will overwrite KRA/KPI text on every linked row from
              May 2026 onward and will reflect on the user dashboard. The
              action is logged and can be undone from <strong>History &amp; Undo</strong>.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !dirty || !kra.trim() || !kpi.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}