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
import { Loader2, ArrowLeft, AlertTriangle, Upload, X, WifiOff, Camera } from 'lucide-react';
import { useBusinessUnits, useDepartments } from '@/hooks/useSafetyOrg';
import { supabase } from '@/integrations/supabase/client';
import {
  SAFETY_TYPE_LABELS,
  SAFETY_SEVERITY_LABELS,
  type SafetyIncidentType,
  type SafetyIncidentSeverity,
} from '@/lib/safetyIncidents';
import { submitSafetyIncident } from '@/lib/safetyIncidentSubmit';
import { enqueuePendingIncident } from '@/lib/safetyOfflineQueue';
import { useSafetyOfflineSync } from '@/hooks/useSafetyOfflineSync';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useImageCompressionSettings } from '@/hooks/useImageCompressionSettings';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';

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
  const { user } = useAuth();
  const qc = useQueryClient();
  const { isOnline } = useSafetyOfflineSync();
  const { data: businessUnits = [] } = useBusinessUnits();
  const { enabled: compressionEnabled, policy: compressionPolicy } =
    useImageCompressionSettings();

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
    if (!user) {
      toast.error('Session lost — please sign in again.');
      return;
    }
    setSubmitting(true);

    // Stable client_submission_id for idempotent retries (online or offline).
    const clientSubmissionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const payload = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      incident_type: type as SafetyIncidentType,
      severity: severity as SafetyIncidentSeverity,
      business_unit_id: businessUnitId || null,
      department_id: departmentId || null,
      involved_person_name: requiresInvolved ? involvedName.trim() : null,
      client_submission_id: clientSubmissionId,
    };

    // Helper: stash to IndexedDB and tell the user.
    const queueOffline = async (reason: string) => {
      try {
        await enqueuePendingIncident({
          id: clientSubmissionId,
          reporter_id: user.id,
          payload,
          files: files.map((f) => ({
            name: f.name,
            type: f.type,
            size: f.size,
            blob: f,
          })),
          created_at: Date.now(),
        });
        toast.success('Saved offline — will sync when you reconnect', {
          description: reason,
        });
        navigate('/safety/incidents');
      } catch (qErr) {
        toast.error('Could not save offline either. Please try again.');
        console.error('[SafetyIncidentNew] enqueue failed:', qErr);
      }
    };

    // Hard-offline shortcut: skip the network attempt entirely.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOffline('You appear to be offline.');
      setSubmitting(false);
      return;
    }

    try {
      const created = await submitSafetyIncident({
        reporterId: user.id,
        payload,
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size, blob: f })),
        compression: {
          enabled: compressionEnabled,
          policy: compressionPolicy,
          severityHint: severity as SafetyIncidentSeverity,
        },
      });
      toast.success(`Incident ${created.incident_number} reported`);
      qc.invalidateQueries({ queryKey: ['safety'] });
      navigate(`/safety/incidents/${created.id}`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const isNetworkErr =
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        err?.name === 'TypeError';
      if (isNetworkErr) {
        await queueOffline('Network unavailable — your report is safe.');
      } else {
        toast.error(msg || 'Failed to submit incident');
        console.error('[SafetyIncidentNew]', err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-3 sm:space-y-4">
      <Button variant="ghost" size="sm" className="min-h-[40px]" onClick={() => navigate('/safety/incidents')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Back to incidents</span>
        <span className="sm:hidden">Back</span>
      </Button>
      <Card>
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <span className="text-base sm:text-lg">Report a Safety Incident</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {!isOnline && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <WifiOff className="h-4 w-4" />
              <span>
                You're offline. Your report will be saved on this device and submitted automatically when you reconnect.
              </span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4" id="safety-incident-form">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="desc">What happened? *</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </div>
              <div>
                <Label htmlFor="loc">Location *</Label>
                <Input id="loc" className="h-11" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Plant 2, Bay 3" />
              </div>
              <div>
                <Label>Type *</Label>
                <Select value={type} onValueChange={(v) => setType(v as SafetyIncidentType)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select type" /></SelectTrigger>
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
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select severity" /></SelectTrigger>
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
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select BU" /></SelectTrigger>
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
                  <SelectTrigger className="h-11"><SelectValue placeholder={businessUnitId ? 'Select dept' : 'Select BU first'} /></SelectTrigger>
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
                  <Input id="involved" className="h-11" value={involvedName} onChange={(e) => setInvolvedName(e.target.value)} placeholder="Name of person involved" />
                </div>
              )}
              <div className="md:col-span-2">
                <Label>Evidence (≥1, max 5, ≤20 MB each — images, MP4, PDF) *</Label>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-md p-4 sm:p-6 cursor-pointer hover:bg-accent/40 active:bg-accent/60 transition-colors min-h-[88px]">
                      <Camera className="h-5 w-5 mb-1.5 text-primary" />
                      <span className="text-xs sm:text-sm font-medium">Take photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={onPickFiles}
                        className="hidden"
                      />
                    </label>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-md p-4 sm:p-6 cursor-pointer hover:bg-accent/40 active:bg-accent/60 transition-colors min-h-[88px]">
                      <Upload className="h-5 w-5 mb-1.5 text-muted-foreground" />
                      <span className="text-xs sm:text-sm font-medium">Upload files</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/mp4,application/pdf"
                        onChange={onPickFiles}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {files.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1.5 min-h-[44px]">
                          <span className="truncate text-xs sm:text-sm">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeFile(i)} aria-label="Remove file">
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="hidden md:flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/safety/incidents')}>Cancel</Button>
              <Button type="submit" disabled={!canSubmit || submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Incident
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <SafetyStickyActionBar
        banner={
          !isOnline ? (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              <WifiOff className="h-3.5 w-3.5" /> Offline — will send when back online
            </div>
          ) : null
        }
      >
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => navigate('/safety/incidents')}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="safety-incident-form"
          className="h-11"
          disabled={!canSubmit || submitting}
        >
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit
        </Button>
      </SafetyStickyActionBar>
    </div>
  );
}