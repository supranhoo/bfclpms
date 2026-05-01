import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, ChevronDown, ChevronRight } from 'lucide-react';
import { ALL_APP_ROLES, type AppRole } from '@/lib/roles';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import {
  DEFAULT_REVIEW_NOTE_ACCESS,
  parseAccessConfig,
  type ReviewNoteAccessConfig,
} from '@/hooks/useReviewNoteAccess';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  management: 'Management',
  hr_pms: 'HR PMS',
  skip_level: 'Skip-Level',
};

const ACTIONS: Array<{ key: keyof ReviewNoteAccessConfig; label: string }> = [
  { key: 'view', label: 'View All' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
  { key: 'view_own_subject', label: 'View Own' },
];

export function ReviewNotesAccessInline() {
  const { data, isLoading } = useSystemSetting('review_action_notes_visibility');
  const update = useUpdateSystemSetting();
  const [open, setOpen] = useState(false);
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
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-md bg-muted/30 my-2">
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium hover:bg-muted/50 rounded-t-md">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          HR Review Notes — Role Access
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Configure which roles can see, create, edit, or delete HR review notes. Admin always retains full access.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs min-w-[100px]">Role</TableHead>
                    {ACTIONS.map((a) => (
                      <TableHead key={a.key} className="text-center text-xs min-w-[70px]">{a.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_APP_ROLES.map((role) => (
                    <TableRow key={role}>
                      <TableCell className="text-xs font-medium py-1.5">
                        {ROLE_LABELS[role]}
                        {role === 'admin' && (
                          <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">always on</Badge>
                        )}
                      </TableCell>
                      {ACTIONS.map((a) => {
                        const checked = config[a.key].includes(role);
                        const disabled = role === 'admin' && a.key !== 'view_own_subject';
                        return (
                          <TableCell key={a.key} className="text-center py-1.5">
                            <Switch
                              checked={checked}
                              onCheckedChange={() => toggle(a.key, role)}
                              disabled={disabled}
                              className="scale-75"
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || update.isPending || isLoading} size="sm">
                <Save className="h-3.5 w-3.5 mr-1" /> Save Notes Permissions
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}