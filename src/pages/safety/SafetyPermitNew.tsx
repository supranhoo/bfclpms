import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, FileSignature, Loader2, Plus, X, Save, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';
import { useBusinessUnits, useDepartments } from '@/hooks/useSafetyOrg';
import {
  useCreatePermitDraft, useSubmitPermit,
} from '@/hooks/useSafetyPermits';
import {
  SAFETY_PERMIT_TYPES, SAFETY_PERMIT_TYPE_LABEL,
  permitNeedsHira, permitNeedsLoto, validatePermitWindow,
  type SafetyPermitType,
} from '@/lib/safetyPermits';

/**
 * Phase 2-B — Permit creation wizard (single page).
 *
 * Two-step UX in one form:
 *   1. Save Draft → row inserted, HIRA/LOTO optional.
 *   2. Submit for Approval → calls submit_permit() RPC which validates
 *      that HIRA/LOTO requirements are met for the chosen type and
 *      materialises the approval ladder from `safety_permit_type_config`.
 *
 * No default duration — user picks every time (per Phase 2 decision).
 */

interface HiraDraft {
  hazard: string;
  risk_before: string;
  controls: string;
  risk_after: string;
}
interface LotoDraft {
  step_no: number;
  description: string;
}

export default function SafetyPermitNew() {
  const navigate = useNavigate();
  const create = useCreatePermitDraft();
  const submit = useSubmitPermit();

  const { data: businessUnits = [] } = useBusinessUnits();

  const [permitType, setPermitType] = useState<SafetyPermitType | ''>('');
  const [scope, setScope] = useState('');
  const [location, setLocation] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [lotoRequired, setLotoRequired] = useState(false);
  const [hiraSummary, setHiraSummary] = useState('');
  const [hira, setHira] = useState<HiraDraft[]>([]);
  const [loto, setLoto] = useState<LotoDraft[]>([]);

  const { data: departments = [] } = useDepartments(businessUnitId || null);

  const needsHira = permitType ? permitNeedsHira(permitType) : false;
  const needsLoto = permitType ? permitNeedsLoto(permitType) || lotoRequired : false;

  const windowError = useMemo(() => {
    if (!startAt || !endAt) return 'Pick both start and end times';
    return validatePermitWindow({ startAt, endAt });
  }, [startAt, endAt]);

  const baseValid =
    permitType !== '' &&
    scope.trim().length >= 5 &&
    location.trim().length >= 2 &&
    !windowError;

  const submitValid =
    baseValid &&
    (!needsHira || hira.length >= 1) &&
    (!needsLoto || loto.length >= 1);

  const buildPayload = () => ({
    permit_type: permitType as SafetyPermitType,
    scope: scope.trim(),
    location: location.trim(),
    start_at: new Date(startAt).toISOString(),
    end_at: new Date(endAt).toISOString(),
    business_unit_id: businessUnitId || null,
    department_id: departmentId || null,
    loto_required: needsLoto,
    hira_summary: hiraSummary.trim() || null,
    hira_rows: hira
      .filter((h) => h.hazard.trim() && h.controls.trim())
      .map((h) => ({
        hazard: h.hazard.trim(),
        risk_before: h.risk_before.trim() || 'medium',
        controls: h.controls.trim(),
        risk_after: h.risk_after.trim() || 'low',
      })),
    loto_steps: loto
      .filter((s) => s.description.trim())
      .map((s, i) => ({ step_no: i + 1, description: s.description.trim() })),
  });

  const onSaveDraft = async () => {
    if (!baseValid) {
      toast.error(windowError ?? 'Fill in the required fields first.');
      return;
    }
    try {
      const row = await create.mutateAsync(buildPayload());
      toast.success(`Draft ${row.permit_number ?? ''} saved`);
      navigate(`/safety/permits/${row.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save draft');
    }
  };

  const onSubmitForApproval = async () => {
    if (!submitValid) {
      toast.error('Add HIRA / LOTO entries required for this permit type.');
      return;
    }
    try {
      const row = await create.mutateAsync(buildPayload());
      await submit.mutateAsync(row.id);
      toast.success(`Permit ${row.permit_number ?? ''} submitted for approval`);
      navigate(`/safety/permits/${row.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Submission failed');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/safety/permits')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to permits
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" /> New Permit to Work
          </CardTitle>
          <CardDescription>
            Save as draft or submit for approval. The approval ladder is
            taken from the configured type-specific approver chain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Permit Type *</Label>
              <Select value={permitType} onValueChange={(v) => setPermitType(v as SafetyPermitType)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {SAFETY_PERMIT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{SAFETY_PERMIT_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="loc">Location *</Label>
              <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Plant 2, Bay 4" />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="scope">Scope of Work *</Label>
              <Textarea
                id="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                rows={3}
                placeholder="Briefly describe what will be done."
              />
            </div>
            <div>
              <Label htmlFor="start">Start *</Label>
              <Input
                id="start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end">End *</Label>
              <Input
                id="end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
            {windowError && (startAt || endAt) && (
              <p className="md:col-span-2 text-xs text-destructive">{windowError}</p>
            )}
            <div>
              <Label>Business Unit</Label>
              <Select value={businessUnitId} onValueChange={(v) => { setBusinessUnitId(v); setDepartmentId(''); }}>
                <SelectTrigger><SelectValue placeholder="Select BU" /></SelectTrigger>
                <SelectContent>
                  {businessUnits.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} disabled={!businessUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder={businessUnitId ? 'Select dept' : 'Select BU first'} />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">LOTO required</Label>
                <p className="text-xs text-muted-foreground">
                  Lockout/Tagout isolation steps must be performed before activation.
                </p>
              </div>
              <Switch checked={needsLoto} onCheckedChange={setLotoRequired} disabled={permitType ? permitNeedsLoto(permitType) : false} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="hsum">HIRA Summary</Label>
              <Textarea
                id="hsum"
                value={hiraSummary}
                onChange={(e) => setHiraSummary(e.target.value)}
                rows={2}
                placeholder="One-line summary of overall risk posture."
              />
            </div>
          </div>

          {needsHira && (
            <HiraEditor rows={hira} onChange={setHira} />
          )}
          {needsLoto && (
            <LotoEditor rows={loto} onChange={setLoto} />
          )}

          <div className="hidden md:flex flex-wrap justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => navigate('/safety/permits')}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onSaveDraft}
              disabled={!baseValid || create.isPending}
            >
              {create.isPending && !submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" /> Save Draft
            </Button>
            <Button
              type="button"
              onClick={onSubmitForApproval}
              disabled={!submitValid || create.isPending || submit.isPending}
            >
              {(create.isPending || submit.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" /> Submit for Approval
            </Button>
          </div>
        </CardContent>
      </Card>

      <SafetyStickyActionBar>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => navigate('/safety/permits')}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11"
          onClick={onSaveDraft}
          disabled={!baseValid || create.isPending}
        >
          {create.isPending && !submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Save className="h-4 w-4 mr-2" /> Draft
        </Button>
        <Button
          type="button"
          className="h-11"
          onClick={onSubmitForApproval}
          disabled={!submitValid || create.isPending || submit.isPending}
        >
          {(create.isPending || submit.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Send className="h-4 w-4 mr-2" /> Submit
        </Button>
      </SafetyStickyActionBar>
    </div>
  );
}

function HiraEditor({
  rows, onChange,
}: {
  rows: HiraDraft[];
  onChange: (next: HiraDraft[]) => void;
}) {
  const addRow = () =>
    onChange([...rows, { hazard: '', risk_before: 'medium', controls: '', risk_after: 'low' }]);
  const upd = (i: number, patch: Partial<HiraDraft>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rm = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">HIRA — Hazard ID & Risk Assessment *</h3>
          <p className="text-xs text-muted-foreground">Required for this permit type. Add at least one row.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" /> Add hazard
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No hazards added yet.</p>
      )}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
          <Input
            className="md:col-span-4"
            placeholder="Hazard"
            value={r.hazard}
            onChange={(e) => upd(i, { hazard: e.target.value })}
          />
          <Select value={r.risk_before} onValueChange={(v) => upd(i, { risk_before: v })}>
            <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['low', 'medium', 'high', 'critical'].map((v) => (
                <SelectItem key={v} value={v}>Risk: {v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="md:col-span-3"
            placeholder="Controls"
            value={r.controls}
            onChange={(e) => upd(i, { controls: e.target.value })}
          />
          <Select value={r.risk_after} onValueChange={(v) => upd(i, { risk_after: v })}>
            <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['low', 'medium', 'high', 'critical'].map((v) => (
                <SelectItem key={v} value={v}>After: {v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => rm(i)}
            className="md:col-span-1 justify-self-end"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function LotoEditor({
  rows, onChange,
}: {
  rows: LotoDraft[];
  onChange: (next: LotoDraft[]) => void;
}) {
  const addRow = () =>
    onChange([...rows, { step_no: rows.length + 1, description: '' }]);
  const upd = (i: number, description: string) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, description } : r)));
  const rm = (i: number) =>
    onChange(rows.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, step_no: idx + 1 })));

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">LOTO — Lockout / Tagout Isolation Steps *</h3>
          <p className="text-xs text-muted-foreground">Required because this permit type involves stored energy.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" /> Add step
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No isolation steps yet.</p>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-mono w-6 text-muted-foreground">#{r.step_no}</span>
          <Input
            value={r.description}
            placeholder="e.g. Open MCC-3 breaker, lock with personal padlock"
            onChange={(e) => upd(i, e.target.value)}
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => rm(i)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}