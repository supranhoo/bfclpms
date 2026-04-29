import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, AlertTriangle, Upload, X } from 'lucide-react';
import { useReportSafetyIncident } from '@/hooks/useSafetyIncidents';
import { useUploadEvidence } from '@/hooks/useSafetyIncidentDetail';
import { useBusinessUnits, useDepartments } from '@/hooks/useSafetyOrg';
import {
  SAFETY_TYPE_LABELS,
  SAFETY_SEVERITY_LABELS,
  type SafetyIncidentType,
  type SafetyIncidentSeverity,
} from '@/lib/safetyIncidents';

/**
 * Incident report form (Phase 1.C).
 *
 * - Mandatory: title, description, location, type, severity.
 * - For unsafe_act / accident → "involved person name" required (POLICY §112-related).
 * - At least one evidence file is required at submit; uploaded after the row
 *   exists so the FK + RLS path is clean.
 * - `client_submission_id` is generated inside the hook for offline idempotency.
 */

const REQUIRES_INVOLVED: SafetyIncidentType[] = ['unsafe_act', 'accident'];

export default function SafetyIncidentNew() {
  const navigate = useNavigate();
  const report = useReportSafetyIncident();
  const { data: businessUnits = [] } = useBusinessUnits();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<SafetyIncidentType | ''>('');
  const [severity, setSeverity] = useState<SafetyIncidentSeverity | ''>('');
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [involvedName, setInvolvedName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: departments = [] } = useDepartments(businessUnitId || null);

  // Pending uploader bound to a placeholder id; we'll re-bind after insert.
  const requiresInvolved = REQUIRES_INVOLVED.includes(type as SafetyIncidentType);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...next].slice(0, 5));
    e.target.value = '';
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const canSubmit =
    title.trim().length >= 3 &&
    description.trim().length >= 10 &&
    location.trim().length >= 2 &&
    type !== '' &&
    severity !== '' &&
    files.length >= 1 &&
    (!requiresInvolved || involvedName.trim().length >= 2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const created = await report.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        incident_type: type as SafetyIncidentType,
        severity: severity as SafetyIncidentSeverity,
        business_unit_id: businessUnitId || null,
        department_id: departmentId || null,
        involved_person_name: requiresInvolved ? involvedName.trim() : null,
      });
      // Upload evidence sequentially against the new id.
      const { useUploadEvidence: _ignored } = await import('@/hooks/useSafetyIncidentDetail');
      // We need a hook bound to the new id, which is tricky outside React; use direct supabase calls instead.
      const { supabase } = await import('@/integrations/supabase/client');
      const { user } = await (async () => {
        const { data } = await supabase.auth.getUser();
        return { user: data.user };
      })();
      if (!user) throw new Error('Session lost');
      for (const f of files) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${user.id}/${created.id}/report/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('safety-media')
          .upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        await supabase.from('safety_incident_evidence').insert({
          incident_id: created.id,
          stage: 'report',
          file_path: path,
          file_name: f.name,
          mime_type: f.type,
          size_bytes: f.size,
          uploaded_by: user.id,
        } as never);
      }
      navigate(`/safety/incidents/${created.id}`);
    } catch (err) {
      // toast already shown by hook for the row; surface upload failure
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/safety/incidents')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to incidents
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Report a Safety Incident
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="desc">What happened? *</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </div>
              <div>
                <Label htmlFor="loc">Location *</Label>
                <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Plant 2, Bay 3" />
              </div>
              <div>
                <Label>Type *</Label>
                <Select value={type} onValueChange={(v) => setType(v as SafetyIncidentType)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SAFETY_TYPE_LABELS) as SafetyIncidentType[]).map((k) => (
                      <SelectItem key={k} value={k}>{SAFETY_TYPE_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity *</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as SafetyIncidentSeverity)}>
                  <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SAFETY_SEVERITY_LABELS) as SafetyIncidentSeverity[]).map((k) => (
                      <SelectItem key={k} value={k}>{SAFETY_SEVERITY_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  <SelectTrigger><SelectValue placeholder={businessUnitId ? 'Select dept' : 'Select BU first'} /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {requiresInvolved && (
                <div className="md:col-span-2">
                  <Label htmlFor="involved">Involved Person *</Label>
                  <Input id="involved" value={involvedName} onChange={(e) => setInvolvedName(e.target.value)} placeholder="Name of person involved" />
                </div>
              )}
              <div className="md:col-span-2">
                <Label>Evidence (≥1, max 5, ≤20 MB each — images, MP4, PDF) *</Label>
                <div className="flex flex-col gap-2 mt-1">
                  <label className="flex items-center justify-center border-2 border-dashed border-border rounded-md p-4 cursor-pointer hover:bg-accent/40 transition-colors">
                    <Upload className="h-4 w-4 mr-2" />
                    <span className="text-sm">Choose files</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/mp4,application/pdf"
                      onChange={onPickFiles}
                      className="hidden"
                    />
                  </label>
                  {files.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1">
                          <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeFile(i)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/safety/incidents')}>Cancel</Button>
              <Button type="submit" disabled={!canSubmit || submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Incident
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}