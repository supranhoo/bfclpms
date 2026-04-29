import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Siren } from 'lucide-react';
import { useCreateDrill } from '@/hooks/useSafetyEmergency';
import {
  SAFETY_DRILL_TYPES,
  SAFETY_DRILL_TYPE_LABEL,
  type SafetyDrillType,
  validateDrillDraft,
} from '@/lib/safetyEmergency';
import { useToast } from '@/hooks/use-toast';

export default function SafetyDrillNew() {
  const nav = useNavigate();
  const { toast } = useToast();
  const create = useCreateDrill();

  const [drillCode, setDrillCode] = useState('');
  const [type, setType] = useState<SafetyDrillType>('fire');
  const [scenario, setScenario] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const submit = async () => {
    const err = validateDrillDraft({ drill_code: drillCode, type, scenario, scheduled_at: scheduledAt });
    if (err) {
      toast({ title: 'Cannot save', description: err, variant: 'destructive' });
      return;
    }
    try {
      const row = await create.mutateAsync({
        drill_code: drillCode.trim(),
        type,
        scenario: scenario.trim(),
        location: location.trim() || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
      });
      toast({ title: 'Drill scheduled', description: row.drill_code });
      nav(`/safety/emergency/drills/${row.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create drill';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
          <Siren className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Schedule Drill</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Drill details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Drill code</Label>
              <Input
                id="code"
                value={drillCode}
                onChange={(e) => setDrillCode(e.target.value)}
                placeholder="DRILL-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SafetyDrillType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SAFETY_DRILL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{SAFETY_DRILL_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scenario">Scenario</Label>
            <Textarea
              id="scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Describe the simulated emergency…"
              rows={4}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="loc">Location</Label>
              <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="when">Scheduled at</Label>
              <Input
                id="when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => nav('/safety/emergency')}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
