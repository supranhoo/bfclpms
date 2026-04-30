import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Shield } from 'lucide-react';
import { ALL_APP_ROLES, type AppRole } from '@/lib/roles';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import {
  DEFAULT_REVIEW_NOTE_ACCESS,
  parseAccessConfig,
  type ReviewNoteAccessConfig,
} from '@/hooks/useReviewNoteAccess';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  management: 'Management',
  hr_pms: 'HR PMS',
  skip_level: 'Skip-Level Manager',
};

const ACTIONS: Array<{ key: keyof ReviewNoteAccessConfig; label: string; help: string }> = [
  { key: 'view', label: 'View All', help: 'See all notes across the org' },
  { key: 'create', label: 'Create', help: 'Add new notes' },
  { key: 'edit', label: 'Edit', help: 'Update notes (assignee can always advance their own)' },
  { key: 'delete', label: 'Delete', help: 'Permanently remove notes' },
  { key: 'view_own_subject', label: 'View Own Only', help: 'See only notes where this user is the subject employee' },
];

export default function ReviewNotesAccess() {
  const { data, isLoading } = useSystemSetting('review_action_notes_visibility');
  const update = useUpdateSystemSetting();

  const [config, setConfig] = useState<ReviewNoteAccessConfig>(DEFAULT_REVIEW_NOTE_ACCESS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.setting_value !== undefined) {
      setConfig(parseAccessConfig(data.setting_value));
      setDirty(false);
    }
  }, [data]);

  const toggle = (action: keyof ReviewNoteAccessConfig, role: AppRole) => {
    setConfig((prev) => {
      const list = prev[action];
      const has = list.includes(role);
      return { ...prev, [action]: has ? list.filter((r) => r !== role) : [...list, role] };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    // Always include admin in operational lists
    const safe: ReviewNoteAccessConfig = {
      ...config,
      view: Array.from(new Set(['admin' as AppRole, ...config.view])),
      create: Array.from(new Set(['admin' as AppRole, ...config.create])),
      edit: Array.from(new Set(['admin' as AppRole, ...config.edit])),
      delete: Array.from(new Set(['admin' as AppRole, ...config.delete])),
    };
    await update.mutateAsync({ key: 'review_action_notes_visibility', value: JSON.stringify(safe) });
    setDirty(false);
  };

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>HR Review Notes — Role Access</CardTitle>
                <CardDescription>
                  Configure which roles can see, create, edit, or delete HR review notes.
                  Admin always retains full access.
                </CardDescription>
              </div>
            </div>
            <Button onClick={handleSave} disabled={!dirty || update.isPending || isLoading} size="sm">
              <Save className="h-4 w-4 mr-1.5" /> Save Permissions
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Role</TableHead>
                  {ACTIONS.map((a) => (
                    <TableHead key={a.key} className="text-center min-w-[110px]">
                      <div className="text-xs font-medium">{a.label}</div>
                      <div className="text-[10px] text-muted-foreground font-normal mt-0.5">{a.help}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_APP_ROLES.map((role) => (
                  <TableRow key={role}>
                    <TableCell className="font-medium">
                      {ROLE_LABELS[role]}
                      {role === 'admin' && (
                        <Badge variant="outline" className="ml-2 text-[10px]">always on</Badge>
                      )}
                    </TableCell>
                    {ACTIONS.map((a) => {
                      const checked = config[a.key].includes(role);
                      const disabled = role === 'admin' && a.key !== 'view_own_subject';
                      return (
                        <TableCell key={a.key} className="text-center">
                          <Switch
                            checked={checked}
                            onCheckedChange={() => toggle(a.key, role)}
                            disabled={disabled}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            <strong>Note:</strong> A user who created a note or is assigned to one can always view and update it,
            regardless of role configuration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}