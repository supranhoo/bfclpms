import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Search, UserPlus, Trash2, Shield } from 'lucide-react';
import { useReportAccess, type ReportAccessConfig } from '@/hooks/useReportAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ALL_APP_ROLES, type AppRole } from '@/lib/roles';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAllPaged } from '@/lib/fetchAll';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  management: 'Management',
  hr_pms: 'HR PMS',
  skip_level: 'Skip-Level',
};

export function ReportAccessTab() {
  const { configs, userOverrides, isLoading, updateAccess, grantUserAccess, revokeUserAccess } = useReportAccess();
  const { toast } = useToast();

  // Local state for editing role configs
  const [editedConfigs, setEditedConfigs] = useState<Record<string, { view_roles: AppRole[]; download_roles: AppRole[] }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // User override form state
  const [overrideSearch, setOverrideSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedReport, setSelectedReport] = useState('');
  const [overrideCanView, setOverrideCanView] = useState(true);
  const [overrideCanDownload, setOverrideCanDownload] = useState(false);

  // Fetch profiles for employee selector
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-for-report-access'],
    queryFn: async () => {
      // Paged fetch — bypasses PostgREST's 1000-row default cap so all active
      // employees are searchable in the override picker.
      return await fetchAllPaged<{ id: string; full_name: string | null; employee_code: string | null; email: string | null }>(
        (from, to) =>
          supabase
            .from('profiles')
            .select('id, full_name, employee_code, email')
            .eq('is_active', true)
            .order('full_name')
            .range(from, to)
      );
    },
  });

  const filteredProfiles = useMemo(() => {
    if (!overrideSearch) return profiles.slice(0, 20);
    const term = overrideSearch.toLowerCase();
    return profiles.filter(p =>
      (p.full_name || '').toLowerCase().includes(term) ||
      (p.employee_code || '').toLowerCase().includes(term) ||
      (p.email || '').toLowerCase().includes(term)
    ).slice(0, 20);
  }, [profiles, overrideSearch]);

  // Enrich overrides with profile names
  const enrichedOverrides = useMemo(() => {
    const profileMap = new Map(profiles.map(p => [p.id, p]));
    return userOverrides.map(o => ({
      ...o,
      userName: profileMap.get(o.user_id)?.full_name || 'Unknown',
      userCode: profileMap.get(o.user_id)?.employee_code || '',
      reportName: configs.find(c => c.report_key === o.report_key)?.report_name || o.report_key,
    }));
  }, [userOverrides, profiles, configs]);

  const getEditedConfig = (config: ReportAccessConfig) => {
    return editedConfigs[config.report_key] || {
      view_roles: config.view_roles,
      download_roles: config.download_roles,
    };
  };

  const toggleRole = (reportKey: string, field: 'view_roles' | 'download_roles', role: AppRole, config: ReportAccessConfig) => {
    const current = getEditedConfig(config);
    const roles = current[field];
    const updated = roles.includes(role)
      ? roles.filter(r => r !== role)
      : [...roles, role];
    setEditedConfigs(prev => ({
      ...prev,
      [reportKey]: { ...current, [field]: updated },
    }));
  };

  const hasChanges = (config: ReportAccessConfig) => {
    const edited = editedConfigs[config.report_key];
    if (!edited) return false;
    return (
      JSON.stringify([...edited.view_roles].sort()) !== JSON.stringify([...config.view_roles].sort()) ||
      JSON.stringify([...edited.download_roles].sort()) !== JSON.stringify([...config.download_roles].sort())
    );
  };

  const handleSave = async (config: ReportAccessConfig) => {
    const edited = getEditedConfig(config);
    setSavingKey(config.report_key);
    try {
      await updateAccess.mutateAsync({
        reportKey: config.report_key,
        viewRoles: edited.view_roles,
        downloadRoles: edited.download_roles,
      });
      setEditedConfigs(prev => {
        const next = { ...prev };
        delete next[config.report_key];
        return next;
      });
      toast({ title: `Updated access for ${config.report_name}` });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleGrantAccess = async () => {
    if (!selectedUserId || !selectedReport) {
      toast({ title: 'Select both a user and a report', variant: 'destructive' });
      return;
    }
    try {
      await grantUserAccess.mutateAsync({
        reportKey: selectedReport,
        userId: selectedUserId,
        canView: overrideCanView,
        canDownload: overrideCanDownload,
      });
      toast({ title: 'Access granted successfully' });
      setSelectedUserId('');
      setSelectedReport('');
      setOverrideCanView(true);
      setOverrideCanDownload(false);
    } catch {
      toast({ title: 'Failed to grant access', variant: 'destructive' });
    }
  };

  const handleRevoke = async (reportKey: string, userId: string) => {
    try {
      await revokeUserAccess.mutateAsync({ reportKey, userId });
      toast({ title: 'Access revoked' });
    } catch {
      toast({ title: 'Failed to revoke', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Role-Based Access */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role-Based Report Access
          </CardTitle>
          <CardDescription>
            Configure which roles can view and download each report. Changes are saved per report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Report</TableHead>
                  <TableHead className="min-w-[300px]">View Roles</TableHead>
                  <TableHead className="min-w-[300px]">Download Roles</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map(config => {
                  const edited = getEditedConfig(config);
                  return (
                    <TableRow key={config.report_key}>
                      <TableCell className="font-medium">{config.report_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {ALL_APP_ROLES.map(role => (
                            <label key={role} className="flex items-center gap-1 text-sm cursor-pointer">
                              <Checkbox
                                checked={edited.view_roles.includes(role)}
                                onCheckedChange={() => toggleRole(config.report_key, 'view_roles', role, config)}
                              />
                              <span>{ROLE_LABELS[role]}</span>
                            </label>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {ALL_APP_ROLES.map(role => (
                            <label key={role} className="flex items-center gap-1 text-sm cursor-pointer">
                              <Checkbox
                                checked={edited.download_roles.includes(role)}
                                onCheckedChange={() => toggleRole(config.report_key, 'download_roles', role, config)}
                              />
                              <span>{ROLE_LABELS[role]}</span>
                            </label>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => handleSave(config)}
                          disabled={!hasChanges(config) || savingKey === config.report_key}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: User-Level Overrides */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            User-Level Overrides
          </CardTitle>
          <CardDescription>
            Grant specific users access to view or download reports, regardless of their role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Grant form */}
          <div className="p-4 rounded-lg border space-y-4">
            <h4 className="font-medium">Grant Access</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Input
                        placeholder="Search..."
                        value={overrideSearch}
                        onChange={e => setOverrideSearch(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    {filteredProfiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email} {p.employee_code ? `(${p.employee_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Report</Label>
                <Select value={selectedReport} onValueChange={setSelectedReport}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select report" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map(c => (
                      <SelectItem key={c.report_key} value={c.report_key}>{c.report_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <Switch checked={overrideCanView} onCheckedChange={setOverrideCanView} id="ov-view" />
                  <Label htmlFor="ov-view">Can View</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={overrideCanDownload} onCheckedChange={setOverrideCanDownload} id="ov-download" />
                  <Label htmlFor="ov-download">Can Download</Label>
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleGrantAccess}
                  disabled={!selectedUserId || !selectedReport || grantUserAccess.isPending}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Grant
                </Button>
              </div>
            </div>
          </div>

          {/* Current overrides */}
          {enrichedOverrides.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>View</TableHead>
                  <TableHead>Download</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedOverrides.map(o => (
                  <TableRow key={o.id}>
                    <TableCell>
                      {o.userName} {o.userCode && <span className="text-muted-foreground">({o.userCode})</span>}
                    </TableCell>
                    <TableCell>{o.reportName}</TableCell>
                    <TableCell>
                      <Badge variant={o.can_view ? 'default' : 'secondary'}>
                        {o.can_view ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.can_download ? 'default' : 'secondary'}>
                        {o.can_download ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(o.report_key, o.user_id)}
                        disabled={revokeUserAccess.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No user-level overrides configured yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
