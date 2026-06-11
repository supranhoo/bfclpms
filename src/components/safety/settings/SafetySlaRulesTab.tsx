import { useMemo, useState } from 'react';
import { Timer, Plus, Search, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  SAFETY_TYPE_LABELS,
  SAFETY_SEVERITY_LABELS,
  SAFETY_PRIORITY_LABELS,
  type SafetyIncidentType,
  type SafetyIncidentSeverity,
  type SafetyIncidentPriority,
} from '@/lib/safetyIncidents';
import {
  useSafetyIncidentSlaRules,
  useUpsertSafetyIncidentSlaRule,
  useToggleSafetyIncidentSlaRule,
  type SafetyIncidentSlaRule,
  type SlaRuleInput,
} from '@/hooks/useSafetyIncidentSlaRules';
import {
  useSafetyIncidentTypes,
  useSafetyIncidentSeverities,
} from '@/hooks/useSafetyIncidentTypes';
import { toast } from 'sonner';

const PRIORITIES = Object.keys(SAFETY_PRIORITY_LABELS) as SafetyIncidentPriority[];

const ANY = '__any__';

function formatHours(h: number) {
  if (h % 24 === 0) return `${h / 24} day${h === 24 ? '' : 's'}`;
  return `${h} hr`;
}

export default function SafetySlaRulesTab() {
  const { data: rules = [], isLoading } = useSafetyIncidentSlaRules();
  const upsert = useUpsertSafetyIncidentSlaRule();
  const toggle = useToggleSafetyIncidentSlaRule();

  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SafetyIncidentSlaRule | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (filterType !== 'all' && r.incident_type !== filterType) return false;
      if (filterSeverity !== 'all' && r.severity !== filterSeverity) return false;
      if (filterPriority !== 'all') {
        if (filterPriority === ANY ? r.priority !== null : r.priority !== filterPriority) return false;
      }
      if (needle && !(r.notes ?? '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rules, filterType, filterSeverity, filterPriority, search]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" /> SLA Configuration
          </CardTitle>
          <CardDescription>
            Configurable completion timelines by Incident Type × Severity × Priority. Historical
            incidents preserve their original SLA — changes apply to new incidents only.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New rule
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => <SelectItem key={t} value={t}>{SAFETY_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SAFETY_SEVERITY_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value={ANY}>Any priority (catch-all)</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{SAFETY_PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Amber at</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      No rules match your filters.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{SAFETY_TYPE_LABELS[r.incident_type]}</TableCell>
                    <TableCell>{SAFETY_SEVERITY_LABELS[r.severity]}</TableCell>
                    <TableCell>
                      {r.priority
                        ? SAFETY_PRIORITY_LABELS[r.priority]
                        : <span className="text-muted-foreground italic">Any</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatHours(r.target_hours)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.amber_threshold_pct}%</TableCell>
                    <TableCell>
                      {r.is_active
                        ? <Badge variant="secondary">Active</Badge>
                        : <Badge variant="outline">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggle.mutate({ id: r.id, is_active: !r.is_active })}
                      >
                        {r.is_active
                          ? <><ToggleRight className="h-3.5 w-3.5 mr-1" />Deactivate</>
                          : <><ToggleLeft className="h-3.5 w-3.5 mr-1" />Activate</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <RuleEditor
        open={creating || !!editing}
        rule={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSave={(input) =>
          upsert.mutate(
            { id: editing?.id, input },
            { onSuccess: () => { setCreating(false); setEditing(null); } },
          )
        }
        saving={upsert.isPending}
      />
    </Card>
  );
}

function RuleEditor({
  open, rule, onClose, onSave, saving,
}: {
  open: boolean;
  rule: SafetyIncidentSlaRule | null;
  onClose: () => void;
  onSave: (input: SlaRuleInput) => void;
  saving: boolean;
}) {
  const [type, setType] = useState<SafetyIncidentType>(rule?.incident_type ?? 'near_miss');
  const [severity, setSeverity] = useState<SafetyIncidentSeverity>(rule?.severity ?? 'medium');
  const [priority, setPriority] = useState<string>(rule?.priority ?? ANY);
  const [hours, setHours] = useState<string>(String(rule?.target_hours ?? 24));
  const [amber, setAmber] = useState<string>(String(rule?.amber_threshold_pct ?? 50));
  const [notes, setNotes] = useState<string>(rule?.notes ?? '');
  const [active, setActive] = useState<boolean>(rule?.is_active ?? true);

  // Re-seed when rule changes
  useMemo(() => {
    setType(rule?.incident_type ?? 'near_miss');
    setSeverity(rule?.severity ?? 'medium');
    setPriority(rule?.priority ?? ANY);
    setHours(String(rule?.target_hours ?? 24));
    setAmber(String(rule?.amber_threshold_pct ?? 50));
    setNotes(rule?.notes ?? '');
    setActive(rule?.is_active ?? true);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule?.id]);

  const submit = () => {
    const h = Number(hours);
    const a = Number(amber);
    if (!Number.isFinite(h) || h <= 0) return toast.error('Target hours must be > 0');
    if (!Number.isFinite(a) || a < 1 || a > 99) return toast.error('Amber threshold must be 1–99');
    onSave({
      incident_type: type,
      severity,
      priority: priority === ANY ? null : (priority as SafetyIncidentPriority),
      target_hours: h,
      amber_threshold_pct: a,
      notes: notes.trim() || null,
      is_active: active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit SLA rule' : 'New SLA rule'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Incident type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SafetyIncidentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{SAFETY_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as SafetyIncidentSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SAFETY_SEVERITY_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any priority (catch-all)</SelectItem>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{SAFETY_PRIORITY_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target (hours)</Label>
              <Input type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Tip: 24 = 1 day, 168 = 7 days.
              </p>
            </div>
            <div>
              <Label>Amber threshold (% elapsed)</Label>
              <Input type="number" min={1} max={99} value={amber} onChange={(e) => setAmber(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant={active ? 'secondary' : 'outline'}
                onClick={() => setActive((v) => !v)}
              >
                {active ? 'Active' : 'Inactive'}
              </Button>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}