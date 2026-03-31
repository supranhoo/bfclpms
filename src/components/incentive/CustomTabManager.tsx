import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import type { CustomTab, CustomTabField } from '@/hooks/useIncentiveCustomTabs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tab: {
    id?: string;
    tab_label: string;
    tab_key: string;
    fields: CustomTabField[];
    sort_order?: number;
  }) => void;
  editingTab?: CustomTab | null;
  isPending?: boolean;
}

function toKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function CustomTabManager({ open, onOpenChange, onSave, editingTab, isPending }: Props) {
  const [tabLabel, setTabLabel] = useState('');
  const [fields, setFields] = useState<CustomTabField[]>([]);

  useEffect(() => {
    if (editingTab) {
      setTabLabel(editingTab.tab_label);
      setFields(editingTab.fields || []);
    } else {
      setTabLabel('');
      setFields([{ key: '', label: '', type: 'text', default_value: '' }]);
    }
  }, [editingTab, open]);

  const addField = () => {
    setFields(prev => [...prev, { key: '', label: '', type: 'text', default_value: '' }]);
  };

  const removeField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx));
  };

  const updateField = (idx: number, patch: Partial<CustomTabField>) => {
    setFields(prev => prev.map((f, i) => {
      if (i !== idx) return f;
      const updated = { ...f, ...patch };
      if (patch.label !== undefined) {
        updated.key = toKey(patch.label);
      }
      return updated;
    }));
  };

  const handleSave = () => {
    const validFields = fields.filter(f => f.label.trim());
    if (!tabLabel.trim() || validFields.length === 0) return;

    const finalFields = validFields.map(f => ({
      ...f,
      key: f.key || toKey(f.label),
    }));

    onSave({
      id: editingTab?.id,
      tab_label: tabLabel.trim(),
      tab_key: editingTab?.tab_key || toKey(tabLabel),
      fields: finalFields,
      sort_order: editingTab?.sort_order ?? 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingTab ? 'Edit Custom Tab' : 'Add Custom Tab'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tab Name</Label>
            <Input
              value={tabLabel}
              onChange={e => setTabLabel(e.target.value)}
              placeholder="e.g. Vessel Rates, Production Achieved"
            />
            {tabLabel && (
              <p className="text-xs text-muted-foreground mt-1">
                Key: <code>{toKey(tabLabel)}</code>
              </p>
            )}
          </div>

          <div>
            <Label className="mb-2 block">Data Entry Fields</Label>
            <div className="space-y-2">
              {fields.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Field label"
                    value={f.label}
                    onChange={e => updateField(idx, { label: e.target.value })}
                  />
                  <Select
                    value={f.type}
                    onValueChange={v => updateField(idx, { type: v as CustomTabField['type'] })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="boolean">Yes/No</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-24"
                    placeholder="Default"
                    value={f.default_value || ''}
                    onChange={e => updateField(idx, { default_value: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeField(idx)}
                    disabled={fields.length <= 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={addField}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!tabLabel.trim() || fields.filter(f => f.label.trim()).length === 0 || isPending}
          >
            {editingTab ? 'Save Changes' : 'Create Tab'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
