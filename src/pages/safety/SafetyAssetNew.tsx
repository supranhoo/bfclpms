import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  SAFETY_ASSET_CATEGORY_SUGGESTIONS,
  SAFETY_ASSET_STATUSES,
  SAFETY_ASSET_STATUS_LABEL,
  validateAssetDraft,
  type SafetyAssetStatus,
} from '@/lib/safetyAssets';
import { useCreateAsset } from '@/hooks/useSafetyAssets';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';
import { toast } from 'sonner';

/**
 * Single-screen asset registration form.
 * Calibration toggle controls whether interval days are required.
 */
export default function SafetyAssetNew() {
  const nav = useNavigate();
  const create = useCreateAsset();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(SAFETY_ASSET_CATEGORY_SUGGESTIONS[0]);
  const [status, setStatus] = useState<SafetyAssetStatus>('active');
  const [location, setLocation] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [installDate, setInstallDate] = useState<string>('');
  const [calibrationRequired, setCalibrationRequired] = useState(false);
  const [intervalDays, setIntervalDays] = useState<string>('');
  const [notes, setNotes] = useState('');

  async function onSubmit() {
    const interval = intervalDays.trim() ? Number(intervalDays) : null;
    const err = validateAssetDraft({
      asset_code: code,
      name,
      category,
      calibration_required: calibrationRequired,
      calibration_interval_days: interval,
    });
    if (err) {
      toast.error(err);
      return;
    }
    try {
      const created = await create.mutateAsync({
        asset_code: code.trim(),
        name: name.trim(),
        category: category.trim(),
        status,
        location: location.trim() || null,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial_no: serial.trim() || null,
        install_date: installDate || null,
        calibration_required: calibrationRequired,
        calibration_interval_days: calibrationRequired ? interval : null,
        notes: notes.trim() || null,
      });
      toast.success('Asset registered.');
      nav(`/safety/assets/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create asset.');
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety/assets"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <h1 className="text-xl font-bold">Register Asset</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identification</CardTitle>
          <CardDescription>Asset code must be unique across the register.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Asset code *">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CR-001" />
          </Field>
          <Field label="Name *">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overhead Crane #1" />
          </Field>
          <Field label="Category *">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SAFETY_ASSET_CATEGORY_SUGGESTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as SafetyAssetStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SAFETY_ASSET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{SAFETY_ASSET_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          <Field label="Manufacturer"><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></Field>
          <Field label="Model"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
          <Field label="Serial number"><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
          <Field label="Install date">
            <Input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calibration</CardTitle>
          <CardDescription>
            Required assets are tracked by the daily expiry sweep and can block permit activation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="cal-req">Calibration required</Label>
            <Switch id="cal-req" checked={calibrationRequired} onCheckedChange={setCalibrationRequired} />
          </div>
          {calibrationRequired && (
            <Field label="Interval (days) *">
              <Input
                type="number"
                min={1}
                max={3650}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                placeholder="e.g. 365"
              />
            </Field>
          )}
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <div className="hidden md:flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/safety/assets">Cancel</Link></Button>
        <Button onClick={onSubmit} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Register Asset
        </Button>
      </div>

      <SafetyStickyActionBar>
        <Button variant="outline" className="h-11" asChild>
          <Link to="/safety/assets">Cancel</Link>
        </Button>
        <Button className="h-11" onClick={onSubmit} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Register
        </Button>
      </SafetyStickyActionBar>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}