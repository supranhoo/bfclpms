import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Network, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useBusinessUnits, useDepartments, useActiveProfilesLite,
} from '@/hooks/useSafetyOrg';
import { formatSafetyProfileLabel } from '@/hooks/useSafetyOrg';
import {
  useSafetyRoutingRules, useUpsertSafetyRoutingRule, useDeleteSafetyRoutingRule,
  type SafetyRoutingRule, type UpsertRuleInput,
} from '@/hooks/useSafetyIncidentRouting';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

const ANY_DEPT = '__division_default__';

function EmployeeSelect({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { data: profiles = [] } = useActiveProfilesLite();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-72">
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {formatSafetyProfileLabel(p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function SafetyIncidentRoutingTab() {
  const { data: bus = [] } = useBusinessUnits();
  const { data: depts = [] } = useDepartments();
  const { data: profiles = [] } = useActiveProfilesLite();
  const { data: rules = [], isLoading } = useSafetyRoutingRules();
  const upsert = useUpsertSafetyRoutingRule();
  const del = useDeleteSafetyRoutingRule();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SafetyRoutingRule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SafetyRoutingRule | null>(null);

  const [form, setForm] = useState<UpsertRuleInput>({
    business_unit_id: '',
    department_id: null,
    bu_head_id: '',
    manager_id: '',
    second_manager_id: '',
    is_active: true,
  });

  const buMap = useMemo(() => new Map(bus.map((b) => [b.id, b.name])), [bus]);
  const deptMap = useMemo(() => new Map(depts.map((d) => [d.id, d.name])), [depts]);
  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, formatSafetyProfileLabel(p)])),
    [profiles],
  );

  function openNew() {
    setEditing(null);
    setForm({
      business_unit_id: '', department_id: null,
      bu_head_id: '', manager_id: '', second_manager_id: '', is_active: true,
    });
    setOpen(true);
  }

  function openEdit(r: SafetyRoutingRule) {
    setEditing(r);
    setForm({
      id: r.id,
      business_unit_id: r.business_unit_id,
      department_id: r.department_id,
      bu_head_id: r.bu_head_id,
      manager_id: r.manager_id,
      second_manager_id: r.second_manager_id,
      is_active: r.is_active,
    });
    setOpen(true);
  }

  function handleSave() {
    upsert.mutate(form, { onSuccess: () => setOpen(false) });
  }

  const scopedDepts = depts.filter((d) => !form.business_unit_id || d.business_unit_id === form.business_unit_id);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4" /> Incident Routing
          </CardTitle>
          <CardDescription>
            Configure the BU Head, Manager and 2nd Manager who should receive incidents for each business unit / department.
            Department-specific rules take precedence over the division default.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit routing rule' : 'New routing rule'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs">Business unit / Division</Label>
                <Select
                  value={form.business_unit_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, business_unit_id: v, department_id: null }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select BU" /></SelectTrigger>
                  <SelectContent>
                    {bus.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Department (optional — leave blank for division default)</Label>
                <Select
                  value={form.department_id ?? ANY_DEPT}
                  onValueChange={(v) => setForm((f) => ({ ...f, department_id: v === ANY_DEPT ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Division default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_DEPT}>— Division default —</SelectItem>
                    {scopedDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">BU Head</Label>
                <EmployeeSelect value={form.bu_head_id} onChange={(v) => setForm((f) => ({ ...f, bu_head_id: v }))} placeholder="Select BU Head" />
              </div>
              <div>
                <Label className="text-xs">Manager</Label>
                <EmployeeSelect value={form.manager_id} onChange={(v) => setForm((f) => ({ ...f, manager_id: v }))} placeholder="Select Manager" />
              </div>
              <div>
                <Label className="text-xs">2nd Manager</Label>
                <EmployeeSelect value={form.second_manager_id} onChange={(v) => setForm((f) => ({ ...f, second_manager_id: v }))} placeholder="Select 2nd Manager" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                <Label className="text-sm">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={
                  upsert.isPending
                  || !form.business_unit_id
                  || !form.bu_head_id || !form.manager_id || !form.second_manager_id
                }
              >
                {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading rules…
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No routing rules yet. Without rules, incidents fall back to Safety Admin / Safety Head.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Unit</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>BU Head</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>2nd Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{buMap.get(r.business_unit_id) ?? '—'}</TableCell>
                  <TableCell>
                    {r.department_id
                      ? (deptMap.get(r.department_id) ?? '—')
                      : <span className="text-muted-foreground italic">Division default</span>}
                  </TableCell>
                  <TableCell>{profileMap.get(r.bu_head_id) ?? '—'}</TableCell>
                  <TableCell>{profileMap.get(r.manager_id) ?? '—'}</TableCell>
                  <TableCell>{profileMap.get(r.second_manager_id) ?? '—'}</TableCell>
                  <TableCell>
                    {r.is_active
                      ? <Badge variant="secondary">Active</Badge>
                      : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={!!pendingDelete}
        onCancel={() => setPendingDelete(null)}
        title="Delete routing rule?"
        description="Future incidents matching this scope will fall back to Safety Admin / Safety Head. Historical incidents keep their stamped routing."
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) {
            del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
          }
        }}
      />
    </Card>
  );
}