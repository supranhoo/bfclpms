import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import { useAuditTemplates, useCreateAuditRun } from '@/hooks/useSafetyAudits';
import { toast } from 'sonner';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';

/** Pick a template + location → create draft run → navigate to runner. */
export default function SafetyAuditRunNew() {
  const nav = useNavigate();
  const { data: templates = [] } = useAuditTemplates({ activeOnly: true });
  const create = useCreateAuditRun();
  const [templateId, setTemplateId] = useState<string>('');
  const [location, setLocation] = useState('');

  async function start() {
    if (!templateId) { toast.error('Select a template.'); return; }
    try {
      const row = await create.mutateAsync({
        template_id: templateId,
        location: location.trim() || null,
      });
      nav(`/safety/audits/runs/${row.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start audit.');
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-24 md:pb-0">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety/audits"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <h1 className="text-xl font-bold">Start Audit</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Setup</CardTitle>
          <CardDescription>Pick a template and the location being audited.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Template *</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.code} · {t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Plant 2 — Bay 3" />
          </div>
          <div className="hidden md:flex justify-end">
            <Button onClick={start} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Start Checklist
            </Button>
          </div>
        </CardContent>
      </Card>

      <SafetyStickyActionBar>
        <Button onClick={start} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Start Checklist
        </Button>
      </SafetyStickyActionBar>
    </div>
  );
}