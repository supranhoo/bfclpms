import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { useEligibilityFields, useCreateEligibilityField, useUpdateEligibilityField, useDeleteEligibilityField } from '@/hooks/useIncentivePrograms';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

const CORE_FIELD_KEYS = [
  'absent_days', 'lwp_days', 'has_warning_letter', 'is_suspended',
  'is_contract_worker', 'lti_count', 'department_lti_count',
  'total_working_days', 'present_days', 'weekly_off_days',
  'production_value', 'availability_percent', 'shutdown_hours',
];

interface Props {
  programId: string;
}

export function EligibilityFieldsConfig({ programId }: Props) {
  const { data: fields = [], isLoading } = useEligibilityFields(programId);
  const createField = useCreateEligibilityField();
  const updateField = useUpdateEligibilityField();
  const deleteField = useDeleteEligibilityField();

  const [showAdd, setShowAdd] = useState(false);
  const [newField, setNewField] = useState({ field_key: '', field_label: '', field_type: 'number', default_value: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newField.field_key || !newField.field_label) return;
    createField.mutate({
      program_id: programId,
      field_key: newField.field_key.toLowerCase().replace(/\s+/g, '_'),
      field_label: newField.field_label,
      field_type: newField.field_type,
      default_value: newField.default_value || null,
      sort_order: fields.length + 1,
    }, {
      onSuccess: () => {
        setShowAdd(false);
        setNewField({ field_key: '', field_label: '', field_type: 'number', default_value: '' });
      },
    });
  };

  const globalFields = fields.filter((f: any) => !f.program_id);
  const programFields = fields.filter((f: any) => f.program_id === programId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Eligibility Fields</h4>
          <p className="text-xs text-muted-foreground">Configure which data columns appear in the eligibility grid</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Custom Field
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          {newField.field_key.toLowerCase() === 'kra_score' && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              KRA score is auto-pulled from PMS final score. To gate eligibility on it, add a <strong>KRA Score (PMS)</strong> rule in the <strong>DQ Rules</strong> tab instead of adding it as a custom field.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Field Label</Label>
              <Input
                placeholder="e.g. Safety Score"
                value={newField.field_label}
                onChange={e => setNewField(p => ({
                  ...p,
                  field_label: e.target.value,
                  field_key: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                }))}
              />
            </div>
            <div>
              <Label className="text-xs">Field Key</Label>
              <Input
                placeholder="auto-generated"
                value={newField.field_key}
                onChange={e => setNewField(p => ({ ...p, field_key: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={newField.field_type} onValueChange={v => setNewField(p => ({ ...p, field_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Yes/No</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Default Value</Label>
              <Input
                placeholder={newField.field_type === 'boolean' ? 'false' : '0'}
                value={newField.default_value}
                onChange={e => setNewField(p => ({ ...p, default_value: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={!newField.field_key || !newField.field_label || createField.isPending}>
              Add Field
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading fields...</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {globalFields.map((f: any) => (
                <TableRow key={f.id} className="text-sm">
                  <TableCell className="font-medium">{f.field_label}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{f.field_key}</TableCell>
                  <TableCell><Badge variant="outline">{f.field_type}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">Global</Badge></TableCell>
                  <TableCell>
                    <Switch
                      checked={f.is_active}
                      onCheckedChange={v => updateField.mutate({ id: f.id, is_active: v })}
                    />
                  </TableCell>
                  <TableCell>
                    {!CORE_FIELD_KEYS.includes(f.field_key) && (
                      <Button size="icon" variant="ghost" onClick={() => setDeletingId(f.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {programFields.map((f: any) => (
                <TableRow key={f.id} className="text-sm">
                  <TableCell className="font-medium">{f.field_label}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{f.field_key}</TableCell>
                  <TableCell><Badge variant="outline">{f.field_type}</Badge></TableCell>
                  <TableCell><Badge>Program</Badge></TableCell>
                  <TableCell>
                    <Switch
                      checked={f.is_active}
                      onCheckedChange={v => updateField.mutate({ id: f.id, is_active: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setDeletingId(f.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ConfirmDestructiveDialog
        open={!!deletingId}
        onConfirm={() => { if (deletingId) deleteField.mutate(deletingId, { onSuccess: () => setDeletingId(null) }); }}
        onCancel={() => setDeletingId(null)}
        title="Delete Eligibility Field"
        description="Are you sure you want to delete this custom field? This action cannot be undone."
        confirmLabel="Delete Field"
        isLoading={deleteField.isPending}
      />
    </div>
  );
}
