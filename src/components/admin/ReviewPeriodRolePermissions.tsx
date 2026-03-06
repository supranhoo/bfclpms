import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Shield } from 'lucide-react';
import { ALL_APP_ROLES, AppRole } from '@/lib/roles';
import { PERMISSION_KEYS, PERMISSION_LABELS, ReviewPeriodLock } from '@/hooks/useReviewPeriodGovernance';

interface Props {
  locks: ReviewPeriodLock[];
  onSaveRoleLock: (lock: {
    lock_type: string;
    target_id: string;
    permissions: Record<string, boolean>;
    is_locked: boolean;
    reason?: string;
  }) => void;
  saving: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  management: 'Management',
  hr_pms: 'HR PMS',
  skip_level: 'Skip Level',
};

const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  edit_kpi: true,
  submit_self_review: true,
  submit_manager_review: true,
  approve: true,
  edit_scores: true,
  add_comments: true,
  view_only: false,
};

export default function ReviewPeriodRolePermissions({ locks, onSaveRoleLock, saving }: Props) {
  const roleLocks = locks.filter(l => l.lock_type === 'role');

  // Build local state from existing locks
  const [rolePerms, setRolePerms] = useState<Record<string, Record<string, boolean>>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const perms: Record<string, Record<string, boolean>> = {};
    ALL_APP_ROLES.forEach(role => {
      const existing = roleLocks.find(l => l.target_id === role);
      perms[role] = existing ? { ...DEFAULT_PERMISSIONS, ...existing.permissions } : { ...DEFAULT_PERMISSIONS };
    });
    setRolePerms(perms);
    setDirty(false);
  }, [locks]);

  const togglePerm = (role: string, perm: string) => {
    setRolePerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role]?.[perm] },
    }));
    setDirty(true);
  };

  const handleSave = () => {
    ALL_APP_ROLES.forEach(role => {
      const perms = rolePerms[role];
      if (!perms) return;
      // Check if any permission is restricted (not all true)
      const isRestricted = PERMISSION_KEYS.some(k => !perms[k]);
      onSaveRoleLock({
        lock_type: 'role',
        target_id: role,
        permissions: perms,
        is_locked: isRestricted,
      });
    });
    setDirty(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Role Permission Matrix</CardTitle>
              <CardDescription>Control what each role can do during this review period</CardDescription>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
            <Save className="h-4 w-4 mr-1.5" />
            Save Permissions
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Role</TableHead>
                {PERMISSION_KEYS.map(perm => (
                  <TableHead key={perm} className="text-center min-w-[100px]">
                    {PERMISSION_LABELS[perm]}
                  </TableHead>
                ))}
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ALL_APP_ROLES.map(role => {
                const perms = rolePerms[role] || DEFAULT_PERMISSIONS;
                const isRestricted = PERMISSION_KEYS.some(k => !perms[k]);
                return (
                  <TableRow key={role}>
                    <TableCell className="font-medium">{ROLE_LABELS[role] || role}</TableCell>
                    {PERMISSION_KEYS.map(perm => (
                      <TableCell key={perm} className="text-center">
                        <Switch
                          checked={perms[perm] ?? true}
                          onCheckedChange={() => togglePerm(role, perm)}
                          disabled={role === 'admin'} // Admin always has full access
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      {role === 'admin' ? (
                        <Badge variant="outline" className="text-xs">Full Access</Badge>
                      ) : isRestricted ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                          Restricted
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                          Full Access
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
