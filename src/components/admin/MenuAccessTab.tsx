import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Menu } from 'lucide-react';
import { useMenuAccess, type MenuAccessConfig } from '@/hooks/useMenuAccess';
import { ALL_APP_ROLES, type AppRole } from '@/lib/roles';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  management: 'Management',
  hr_pms: 'HR PMS',
  skip_level: 'Skip-Level',
};

const SECTION_LABELS: Record<string, string> = {
  main: 'Main',
  manager: 'Manager',
  hr_pms: 'HR PMS',
  management: 'Management',
  audit: 'Audit',
  admin: 'Administration',
  dataEntry: 'Data Entry',
  reports: 'Reports',
};

export function MenuAccessTab() {
  const { configs, isLoading, updateMenuAccess } = useMenuAccess();
  const { toast } = useToast();
  const [editedConfigs, setEditedConfigs] = useState<Record<string, AppRole[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const getEditedRoles = (config: MenuAccessConfig): AppRole[] => {
    return editedConfigs[config.menu_key] ?? config.allowed_roles;
  };

  const toggleRole = (menuKey: string, role: AppRole, currentRoles: AppRole[]) => {
    // Safety: never remove admin from admin-settings
    if (menuKey === 'admin-settings' && role === 'admin') return;

    const updated = currentRoles.includes(role)
      ? currentRoles.filter(r => r !== role)
      : [...currentRoles, role];
    setEditedConfigs(prev => ({ ...prev, [menuKey]: updated }));
  };

  const hasChanges = (config: MenuAccessConfig): boolean => {
    const edited = editedConfigs[config.menu_key];
    if (!edited) return false;
    const orig = config.allowed_roles;
    return JSON.stringify([...orig].sort()) !== JSON.stringify([...edited].sort());
  };

  const handleSave = async (config: MenuAccessConfig) => {
    const roles = getEditedRoles(config);
    setSavingKey(config.menu_key);
    try {
      await updateMenuAccess.mutateAsync({ menuKey: config.menu_key, allowedRoles: roles });
      setEditedConfigs(prev => {
        const next = { ...prev };
        delete next[config.menu_key];
        return next;
      });
      toast({ title: 'Saved', description: `Updated access for "${config.menu_name}"` });
    } catch {
      toast({ title: 'Error', description: 'Failed to save changes', variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Group configs by section
  const sections = configs.reduce<Record<string, MenuAccessConfig[]>>((acc, c) => {
    (acc[c.section] ||= []).push(c);
    return acc;
  }, {});

  const sectionOrder = ['main', 'manager', 'hr_pms', 'management', 'audit', 'admin', 'dataEntry', 'reports'];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Menu className="h-5 w-5" />
            Menu Access Rights
          </CardTitle>
          <CardDescription>
            Control which roles can see each sidebar menu item. Changes take effect immediately after save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Menu Item</TableHead>
                  <TableHead className="w-[100px]">Section</TableHead>
                  {ALL_APP_ROLES.map(role => (
                    <TableHead key={role} className="text-center w-[90px]">
                      {ROLE_LABELS[role]}
                    </TableHead>
                  ))}
                  <TableHead className="w-[80px] text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sectionOrder.map(sectionKey => {
                  const items = sections[sectionKey];
                  if (!items?.length) return null;
                  return items.map((config, idx) => {
                    const roles = getEditedRoles(config);
                    const changed = hasChanges(config);
                    return (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">
                          {idx === 0 && (
                            <Badge variant="outline" className="mr-2 text-[10px]">
                              {SECTION_LABELS[sectionKey] || sectionKey}
                            </Badge>
                          )}
                          {config.menu_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {SECTION_LABELS[config.section] || config.section}
                        </TableCell>
                        {ALL_APP_ROLES.map(role => {
                          const isLocked = config.menu_key === 'admin-settings' && role === 'admin';
                          return (
                            <TableCell key={role} className="text-center">
                              <Checkbox
                                checked={roles.includes(role)}
                                onCheckedChange={() => toggleRole(config.menu_key, role, roles)}
                                disabled={isLocked}
                                aria-label={`${role} access to ${config.menu_name}`}
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant={changed ? 'default' : 'ghost'}
                            disabled={!changed || savingKey === config.menu_key}
                            onClick={() => handleSave(config)}
                            className="h-7 px-2"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
