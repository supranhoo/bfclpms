import { useState } from 'react';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, ExternalLink, AlertCircle, Pencil, Eye } from 'lucide-react';
import { PolicyRenderer } from '@/components/policy/PolicyRenderer';
import { PolicyEditorDialog } from '@/components/policy/PolicyEditorDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Navigate } from 'react-router-dom';
import { useMenuAccess } from '@/hooks/useMenuAccess';

const ALL_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'management', label: 'Management' },
  { value: 'hr_pms', label: 'HR PMS' },
];

export default function PMSPolicy() {
  const { data: appSettings, isLoading } = useAppSettings();
  const { effectiveRole: role } = useAuth();
  const { canAccess, isLoading: menuLoading } = useMenuAccess();
  const [editorOpen, setEditorOpen] = useState(false);
  const updateSettings = useUpdateAppSettings();

  const policyContent = (appSettings as any)?.pms_policy_content as string | null;
  const policyUrl = appSettings?.pms_policy_url;
  const visibleRoles = appSettings?.pms_policy_visible_roles || ALL_ROLES.map(r => r.value);

  // Route guard (BUG-042): defer to useMenuAccess so the page and the sidebar
  // share a single admit policy. canAccess('pms-policy') checks
  // app_settings.pms_policy_visible_roles + per-user overrides.
  if (!isLoading && !menuLoading && role && !canAccess('pms-policy')) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleToggleRole = (roleValue: string, checked: boolean) => {
    if (roleValue === 'admin') return; // Admin always visible
    const newRoles = checked
      ? [...visibleRoles, roleValue]
      : visibleRoles.filter(r => r !== roleValue);
    updateSettings.mutate({ pms_policy_visible_roles: newRoles });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">PMS Policy</h1>
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const AdminControls = () => (
    role === 'admin' ? (
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Eye className="h-4 w-4 mr-2" />
              Visibility
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              <p className="text-sm font-medium">Visible to Roles</p>
              {ALL_ROLES.map(r => (
                <div key={r.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${r.value}`}
                    checked={visibleRoles.includes(r.value)}
                    disabled={r.value === 'admin'}
                    onCheckedChange={(checked) => handleToggleRole(r.value, !!checked)}
                  />
                  <Label htmlFor={`role-${r.value}`} className="text-sm cursor-pointer">
                    {r.label}
                    {r.value === 'admin' && <span className="text-muted-foreground ml-1">(always)</span>}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit Policy
        </Button>
      </div>
    ) : null
  );

  // If we have stored content, render it inline
  if (policyContent) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">PMS Policy</h1>
              <p className="text-muted-foreground">Performance Management System Policy Document</p>
            </div>
          </div>
          <AdminControls />
        </div>

        <Card>
          <CardContent className="p-6 md:p-8">
            <PolicyRenderer content={policyContent} />
          </CardContent>
        </Card>

        {role === 'admin' && (
          <PolicyEditorDialog
            open={editorOpen}
            onOpenChange={setEditorOpen}
            initialContent={policyContent}
          />
        )}
      </div>
    );
  }

  // Fallback: URL-based iframe (backward compatibility)
  if (policyUrl) {
    const isPdf = policyUrl.toLowerCase().endsWith('.pdf');
    const isGoogleDoc = policyUrl.includes('docs.google.com') || policyUrl.includes('drive.google.com');

    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">PMS Policy</h1>
              <p className="text-muted-foreground">Performance Management System Policy Document</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AdminControls />
            <Button variant="outline" asChild>
              <a href={policyUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </a>
            </Button>
          </div>
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isPdf ? (
              <iframe src={`${policyUrl}#toolbar=1&navpanes=0`} className="w-full h-[800px] border-0" title="PMS Policy Document" />
            ) : isGoogleDoc ? (
              <iframe src={policyUrl.includes('/preview') ? policyUrl : `${policyUrl}?embedded=true`} className="w-full h-[800px] border-0" title="PMS Policy Document" />
            ) : (
              <iframe src={policyUrl} className="w-full h-[800px] border-0" title="PMS Policy Document" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // No content and no URL
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">PMS Policy</h1>
        </div>
        <AdminControls />
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Policy Not Configured</h3>
            <p className="text-muted-foreground max-w-md">
              The PMS Policy document has not been configured yet. Please contact your administrator to set up the policy content in System Settings.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
