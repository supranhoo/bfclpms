import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Plus, Trash2, Save, Loader2, Settings, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSafetyPermitTypeConfig, useUpsertPermitTypeConfig, useDeletePermitTypeConfigRow,
  type SafetyPermitTypeConfigRow,
} from '@/hooks/useSafetyPermits';
import {
  SAFETY_PERMIT_TYPES, SAFETY_PERMIT_TYPE_LABEL, type SafetyPermitType,
} from '@/lib/safetyPermits';
import { ALL_SAFETY_ROLES, SAFETY_ROLE_LABEL, type SafetyAppRole } from '@/lib/safetyRoles';

/**
 * Per-permit-type approval ladder admin. Each permit type can have a
 * configurable chain of approvers (level + role + label). At runtime,
 * `submit_permit()` materialises this chain into safety_permit_approvals.
 */
export default function SafetyPermitTypeConfig() {
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState<SafetyPermitType>('hot_work');
  const { data: rows = [], isLoading } = useSafetyPermitTypeConfig(activeType);
  const upsert = useUpsertPermitTypeConfig();
  const del = useDeletePermitTypeConfigRow();

  const [draft, setDraft] = useState<Array<Partial<SafetyPermitTypeConfigRow> & {
    permit_type: SafetyPermitType;
    level: number;
    approver_role: SafetyAppRole;
    label: string;
    is_active: boolean;
    _new?: boolean;
  }>>([]);

  // Re-seed draft when filtered rows change. Side-effects only in useEffect.
  useEffect(() => {
    setDraft(rows.map((r) => ({
      id: r.id,
      permit_type: r.permit_type,
      level: r.level,
      approver_role: r.approver_role,
      label: r.label,
      is_active: r.is_active,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.id).join('|')]);

  const addLevel = () => {
    const nextLevel = (draft[draft.length - 1]?.level ?? 0) + 1;
    setDraft([...draft, {
      permit_type: activeType,
      level: nextLevel,
      approver_role: 'safety_officer',
      label: `Level ${nextLevel}`,
      is_active: true,
      _new: true,
    }]);
  };

  const update = (i: number, patch: Partial<typeof draft[number]>) =>
    setDraft(draft.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const removeRow = async (i: number) => {
    const row = draft[i];
    if (row.id) {
      try {
        await del.mutateAsync(row.id);
        toast.success('Level removed');
      } catch (e: any) {
        toast.error(e?.message ?? 'Delete failed');
        return;
      }
    }
    setDraft(draft.filter((_, idx) => idx !== i));
  };

  const onSave = async () => {
    try {
      // Renumber sequentially before save
      const normalized = draft.map((r, idx) => ({
        ...(r.id ? { id: r.id } : {}),
        permit_type: activeType,
        level: idx + 1,
        approver_role: r.approver_role,
        label: r.label.trim() || `Level ${idx + 1}`,
        is_active: r.is_active,
      }));
      if (normalized.length === 0) {
        toast.error('Add at least one approval level.');
        return;
      }
      await upsert.mutateAsync(normalized);
      toast.success('Approval ladder saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/safety')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Safety
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Permit Approval Ladders
          </CardTitle>
          <CardDescription>
            Configure how many approvals each permit type requires and which Safety roles can sign each level. Changes apply to permits submitted from this point onward.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <FileSignature className="h-4 w-4 text-muted-foreground" />
            <Select value={activeType} onValueChange={(v) => setActiveType(v as SafetyPermitType)}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SAFETY_PERMIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{SAFETY_PERMIT_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          )}

          {!isLoading && (
            <div className="space-y-2">
              {draft.length === 0 && (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  No levels configured for this type yet. Add the first level below.
                </p>
              )}
              {draft.map((r, i) => (
                <div key={r.id ?? `new-${i}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border rounded-md p-2">
                  <div className="md:col-span-1 text-xs font-mono text-muted-foreground text-center">
                    L{i + 1}
                  </div>
                  <Input
                    className="md:col-span-4"
                    value={r.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="Display label (e.g. Supervisor)"
                  />
                  <Select
                    value={r.approver_role}
                    onValueChange={(v) => update(i, { approver_role: v as SafetyAppRole })}
                  >
                    <SelectTrigger className="md:col-span-4"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_SAFETY_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{SAFETY_ROLE_LABEL[role]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="md:col-span-2 flex items-center gap-2 justify-end">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => update(i, { is_active: v })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(i)}
                    className="md:col-span-1 justify-self-end"
                    aria-label="Remove level"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2 pt-2 border-t">
            <Button variant="outline" onClick={addLevel}>
              <Plus className="h-4 w-4 mr-2" /> Add level
            </Button>
            <Button onClick={onSave} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save ladder
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}