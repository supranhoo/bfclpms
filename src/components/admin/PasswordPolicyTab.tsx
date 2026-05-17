import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, Key, Mail, Search, Shield, Users, History, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useEligibleUsers, usePasswordRolloutLogs, usePasswordRolloutMutation, type EligibleUser } from '@/hooks/usePasswordRollout';

export function PasswordPolicyTab() {
  const { data: eligibleUsers, isLoading: usersLoading } = useEligibleUsers();
  const { data: logs, isLoading: logsLoading } = usePasswordRolloutLogs();
  const rolloutMutation = usePasswordRolloutMutation();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  // Department list from eligible users
  const departments = useMemo(() => {
    if (!eligibleUsers) return [];
    const deptIds = new Set(eligibleUsers.map(u => u.department_id).filter(Boolean));
    return Array.from(deptIds) as string[];
  }, [eligibleUsers]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!eligibleUsers) return [];
    return eligibleUsers.filter(u => {
      if (eligibilityFilter !== 'all' && u.eligibility_type !== eligibilityFilter) return false;
      if (departmentFilter !== 'all' && u.department_id !== departmentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          (u.full_name?.toLowerCase().includes(q)) ||
          (u.employee_code?.toLowerCase().includes(q)) ||
          (u.email?.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [eligibleUsers, eligibilityFilter, departmentFilter, search]);

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const newSet = new Set(selectedIds);
      filteredUsers.forEach(u => newSet.delete(u.id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      filteredUsers.forEach(u => newSet.add(u.id));
      setSelectedIds(newSet);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleRollout = () => {
    rolloutMutation.mutate(
      { userIds: Array.from(selectedIds), sendEmail },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setSelectedIds(new Set());
        },
      }
    );
  };

  const eligibilityBadge = (type: string) => {
    switch (type) {
      case 'has_kras':
        return <Badge variant="secondary">Has KRAs</Badge>;
      case 'reporting_manager':
        return <Badge variant="outline">Manager</Badge>;
      case 'auditor':
        return <Badge variant="outline" className="border-primary text-primary">Auditor</Badge>;
      case 'both':
        return <Badge>Both</Badge>;
      case 'role_holder':
        return <Badge variant="outline">Role Assigned</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  if (usersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Eligibility & Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Eligible Users
          </CardTitle>
          <CardDescription>
            Users with KRAs or who manage employees with KRAs. Select users to generate login credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={eligibilityFilter} onValueChange={setEligibilityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Eligibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="has_kras">Has KRAs</SelectItem>
                <SelectItem value="reporting_manager">Reporting Manager</SelectItem>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="auditor">Auditor</SelectItem>
                <SelectItem value="role_holder">Role Assigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User Table */}
          <div className="border rounded-lg overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Employee Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Eligibility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No eligible users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(user => (
                    <TableRow key={user.id} className="cursor-pointer" onClick={() => toggleSelect(user.id)}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(user.id)}
                          onCheckedChange={() => toggleSelect(user.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{user.employee_code || '—'}</TableCell>
                      <TableCell>{user.full_name || '—'}</TableCell>
                      <TableCell className="text-sm">{user.email}</TableCell>
                      <TableCell>{eligibilityBadge(user.eligibility_type)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{selectedIds.size} of {filteredUsers.length} selected</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={selectedIds.size === 0 || rolloutMutation.isPending}
                onClick={() => { setSendEmail(false); setConfirmOpen(true); }}
              >
                <Key className="h-4 w-4 mr-2" />
                Generate Only
              </Button>
              <Button
                disabled={selectedIds.size === 0 || rolloutMutation.isPending}
                onClick={() => { setSendEmail(true); setConfirmOpen(true); }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Generate & Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rollout History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Rollout History
          </CardTitle>
          <CardDescription>Recent password generation events.</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !logs || logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No rollout history yet.</p>
          ) : (
            <div className="border rounded-lg overflow-auto max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
                      </TableCell>
                      <TableCell>
                        <div>{log.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{log.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-sm">{log.email}</TableCell>
                      <TableCell>
                        {log.status === 'success' ? (
                          <Badge className="gap-1"><CheckCircle className="h-3 w-3" /> Success</Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.email_sent ? (
                          <Badge variant="secondary" className="gap-1"><Mail className="h-3 w-3" /> Sent</Badge>
                        ) : log.email_error ? (
                          <span className="text-xs text-destructive" title={log.email_error}>Failed</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Confirm Password Rollout
            </DialogTitle>
            <DialogDescription>
              This action will generate new passwords for the selected users, overwriting any existing passwords.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-medium">{selectedIds.size} users selected</span>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="send-email-toggle">Send credentials via email</Label>
              <Switch
                id="send-email-toggle"
                checked={sendEmail}
                onCheckedChange={setSendEmail}
              />
            </div>
            {!sendEmail && (
              <p className="text-sm text-destructive">
                ⚠️ Passwords will be generated but NOT emailed. Users won't know their new credentials.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={rolloutMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleRollout} disabled={rolloutMutation.isPending}>
              {rolloutMutation.isPending ? 'Processing...' : 'Proceed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
