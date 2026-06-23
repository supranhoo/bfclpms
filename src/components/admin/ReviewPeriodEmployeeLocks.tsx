import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock, Unlock, User, Search } from 'lucide-react';
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

export default function ReviewPeriodEmployeeLocks({ locks, onToggleLock, saving }: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const empLocks = locks.filter(l => l.lock_type === 'employee');

  const { data: employees } = useQuery({
    queryKey: ['employees-for-locks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code, department_id, departments!profiles_department_fk(name)')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = (employees || []).filter(emp => {
    const empLock = empLocks.find(l => l.target_id === emp.id);
    const isLocked = empLock?.is_locked ?? false;

    if (search) {
      const q = search.toLowerCase();
      const match = (emp.full_name || '').toLowerCase().includes(q)
        || (emp.email || '').toLowerCase().includes(q)
        || (emp.employee_code || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (deptFilter !== 'all' && emp.department_id !== deptFilter) return false;
    if (statusFilter === 'locked' && !isLocked) return false;
    if (statusFilter === 'open' && isLocked) return false;
    return true;
  });

  const handleToggle = (empId: string, currentlyLocked: boolean) => {
    const allFalse = {
      edit_kpi: false, submit_self_review: false, submit_manager_review: false,
      approve: false, edit_scores: false, add_comments: false, view_only: true,
    };
    const allTrue = {
      edit_kpi: true, submit_self_review: true, submit_manager_review: true,
      approve: true, edit_scores: true, add_comments: true, view_only: false,
    };
    onToggleLock({
      lock_type: 'employee',
      target_id: empId,
      permissions: currentlyLocked ? allTrue : allFalse,
      is_locked: !currentlyLocked,
      reason: reasons[empId] || undefined,
    });
    setReasons(prev => ({ ...prev, [empId]: '' }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <User className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Employee Locks</CardTitle>
            <CardDescription>Lock or unlock individual employees</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {(departments || []).map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
              <SelectItem value="open">Open</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map(emp => {
                const empLock = empLocks.find(l => l.target_id === emp.id);
                const isLocked = empLock?.is_locked ?? false;
                const deptName = (emp as any).departments?.name || '—';
                return (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{emp.full_name || emp.email}</p>
                        {emp.employee_code && (
                          <p className="text-xs text-muted-foreground">{emp.employee_code}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{deptName}</TableCell>
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
                        <span className="text-xs text-muted-foreground">{empLock?.reason || '—'}</span>
                      ) : (
                        <Input
                          placeholder="Reason..."
                          value={reasons[emp.id] || ''}
                          onChange={e => setReasons(prev => ({ ...prev, [emp.id]: e.target.value }))}
                          className="h-7 text-xs"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={isLocked ? 'outline' : 'destructive'}
                        size="sm"
                        onClick={() => handleToggle(emp.id, isLocked)}
                        disabled={saving}
                      >
                        {isLocked ? 'Unlock' : 'Lock'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No employees match filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.length > 50 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-2 text-sm">
                    Showing first 50 of {filtered.length} employees. Use search to narrow results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
