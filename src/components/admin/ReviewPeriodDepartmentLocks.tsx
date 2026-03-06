import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lock, Unlock, Building2 } from 'lucide-react';
import { ReviewPeriodLock } from '@/hooks/useReviewPeriodGovernance';

interface Props {
  locks: ReviewPeriodLock[];
  onToggleLock: (lock: {
    lock_type: string;
    target_id: string;
    permissions: Record<string, boolean>;
    is_locked: boolean;
    reason?: string;
  }) => void;
  saving: boolean;
}

export default function ReviewPeriodDepartmentLocks({ locks, onToggleLock, saving }: Props) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const deptLocks = locks.filter(l => l.lock_type === 'department');

  const { data: departments } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const handleToggle = (deptId: string, currentlyLocked: boolean) => {
    const allFalse = {
      edit_kpi: false, submit_self_review: false, submit_manager_review: false,
      approve: false, edit_scores: false, add_comments: false, view_only: true,
    };
    const allTrue = {
      edit_kpi: true, submit_self_review: true, submit_manager_review: true,
      approve: true, edit_scores: true, add_comments: true, view_only: false,
    };
    onToggleLock({
      lock_type: 'department',
      target_id: deptId,
      permissions: currentlyLocked ? allTrue : allFalse,
      is_locked: !currentlyLocked,
      reason: reasons[deptId] || undefined,
    });
    setReasons(prev => ({ ...prev, [deptId]: '' }));
  };

  const handleBulkLock = (lock: boolean) => {
    (departments || []).forEach(dept => {
      const existing = deptLocks.find(l => l.target_id === dept.id);
      if ((existing?.is_locked ?? false) !== lock) {
        handleToggle(dept.id, !lock);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Department Locks</CardTitle>
              <CardDescription>Lock or unlock specific departments</CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBulkLock(false)} disabled={saving}>
              <Unlock className="h-3 w-3 mr-1" /> Unlock All
            </Button>
            <Button variant="destructive" size="sm" onClick={() => handleBulkLock(true)} disabled={saving}>
              <Lock className="h-3 w-3 mr-1" /> Lock All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(departments || []).map(dept => {
              const lock = deptLocks.find(l => l.target_id === dept.id);
              const isLocked = lock?.is_locked ?? false;
              return (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell>
                    {isLocked ? (
                      <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        <Lock className="h-3 w-3 mr-1" /> Locked
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <Unlock className="h-3 w-3 mr-1" /> Open
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isLocked ? (
                      <span className="text-sm text-muted-foreground">{lock?.reason || '—'}</span>
                    ) : (
                      <Input
                        placeholder="Lock reason..."
                        value={reasons[dept.id] || ''}
                        onChange={e => setReasons(prev => ({ ...prev, [dept.id]: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={isLocked ? 'outline' : 'destructive'}
                      size="sm"
                      onClick={() => handleToggle(dept.id, isLocked)}
                      disabled={saving}
                    >
                      {isLocked ? <><Unlock className="h-3 w-3 mr-1" /> Unlock</> : <><Lock className="h-3 w-3 mr-1" /> Lock</>}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {(!departments || departments.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  No departments found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
