import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings, Users, Timer, ScrollText, ShieldCheck, Activity, Save,
  Loader2, Phone, AlertTriangle, ArrowLeft, KeyRound, FileSignature,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useSafetySettings, useUpsertSafetySetting } from '@/hooks/useSafetySettings';
import { formatSettingValue, parseSettingJson } from '@/lib/safetySettings';
import { format } from 'date-fns';

/**
 * SafetySettings — Cross-cutting Phase X
 * --------------------------------------
 * One stop for every admin destination in the Safety Module + a
 * generic JSON key-value editor backed by `public.safety_settings`.
 * Per the workspace zero-hardcoding rule, every business variable
 * (PTW expiry offset, training overdue, audit thresholds…) lives here.
 */

const ADMIN_LINKS: Array<{
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { to: '/safety/settings/users',         label: 'Users & Roles',     description: 'Grant or revoke Safety roles for users.', icon: Users },
  { to: '/safety/settings/permit-types',  label: 'Permit Types',      description: 'Per-type approval ladders for PTW.',     icon: ShieldCheck },
  { to: '/safety/settings/sla',           label: 'SLA Monitor',       description: 'Severity SLA matrix + escalation status.', icon: Timer },
  { to: '/safety/settings/audit',         label: 'Audit Log',         description: 'Immutable audit trail across the module.', icon: ScrollText },
  { to: '/safety/settings/hours-worked',  label: 'Hours Worked',      description: 'Monthly hours per BU — drives TRIR.',     icon: Activity },
  { to: '/safety/emergency/contacts',     label: 'Emergency Contacts',description: 'Manage the emergency contact directory.', icon: Phone },
  { to: '/safety/training/admin',         label: 'Training Admin',    description: 'SOPs, quizzes, and assignments.',         icon: FileSignature },
];

export default function SafetySettings() {
  const { data: rows = [], isLoading } = useSafetySettings();
  const upsert = useUpsertSafetySetting();

  const [edit, setEdit] = useState<Record<string, string>>({});

  function handleSave(key: string, currentValue: unknown, currentDesc: string | null) {
    const raw = edit[key] ?? formatSettingValue(currentValue);
    const parsed = parseSettingJson(raw);
    if ('error' in parsed) {
      toast.error(`Invalid JSON: ${parsed.error}`);
      return;
    }
    upsert.mutate(
      { key, value: parsed.value, description: currentDesc },
      {
        onSuccess: () => {
          toast.success(`Saved “${key}”`);
          setEdit((s) => {
            const n = { ...s };
            delete n[key];
            return n;
          });
        },
        onError: (e: unknown) =>
          toast.error((e as Error).message ?? 'Failed to save setting'),
      },
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <Settings className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Safety Settings</h1>
          <p className="text-muted-foreground">
            Admin destinations and tunable business variables for the Safety Module.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/safety" className="flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Safety Home
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Admin destinations</CardTitle>
          <CardDescription>Jump directly to any administrative surface.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ADMIN_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-lg border p-3 hover:bg-muted/50 transition-colors flex items-start gap-3"
            >
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                <l.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm">{l.label}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{l.description}</div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Tunable business variables
          </CardTitle>
          <CardDescription>
            JSON values stored in <code className="text-xs">safety_settings</code>. Only admin / safety_head can save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading settings…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> No settings rows seeded.
            </div>
          ) : (
            rows.map((row) => {
              const current = edit[row.key] ?? formatSettingValue(row.value);
              const dirty = edit[row.key] !== undefined && edit[row.key] !== formatSettingValue(row.value);
              return (
                <div key={row.key} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-sm font-semibold">{row.key}</code>
                    {dirty && <Badge variant="outline" className="text-amber-600">unsaved</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      Updated {format(new Date(row.updated_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  {row.description && (
                    <p className="text-xs text-muted-foreground">{row.description}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Value (JSON)</Label>
                      <Textarea
                        rows={3}
                        value={current}
                        onChange={(e) =>
                          setEdit((s) => ({ ...s, [row.key]: e.target.value }))
                        }
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        size="sm"
                        onClick={() => handleSave(row.key, row.value, row.description)}
                        disabled={upsert.isPending || !dirty}
                      >
                        {upsert.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-1" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div className="rounded-lg border border-dashed p-3">
            <div className="text-xs text-muted-foreground mb-2">Add a new key</div>
            <NewSettingForm onSaved={() => {}} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewSettingForm({ onSaved }: { onSaved: () => void }) {
  const upsert = useUpsertSafetySetting();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');

  function handleAdd() {
    if (!key.trim()) {
      toast.error('Key is required.');
      return;
    }
    const parsed = parseSettingJson(value);
    if ('error' in parsed) {
      toast.error(`Invalid JSON: ${parsed.error}`);
      return;
    }
    upsert.mutate(
      { key: key.trim(), value: parsed.value, description: description.trim() || null },
      {
        onSuccess: () => {
          toast.success(`Added “${key.trim()}”`);
          setKey('');
          setValue('');
          setDescription('');
          onSaved();
        },
        onError: (e: unknown) =>
          toast.error((e as Error).message ?? 'Failed to add setting'),
      },
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
      <Input
        placeholder="key (snake_case)"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="font-mono text-xs"
      />
      <Input
        placeholder='JSON value e.g. 30 or "text"'
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="font-mono text-xs"
      />
      <Input
        placeholder="description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Button onClick={handleAdd} disabled={upsert.isPending} size="sm">
        {upsert.isPending ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-1" />
        )}
        Add
      </Button>
    </div>
  );
}