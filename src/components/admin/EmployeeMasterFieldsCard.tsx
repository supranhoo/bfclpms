import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ClipboardCheck } from 'lucide-react';
import { useEmployeeMasterFieldRequirements, EMPLOYEE_MASTER_FIELDS_SETTING_KEY } from '@/hooks/useEmployeeMasterFieldRequirements';
import { useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { EMPLOYEE_MASTER_FIELDS } from '@/lib/employeeMasterFields';
import { RequiredMark } from '@/components/ui/RequiredMark';

export function EmployeeMasterFieldsCard() {
  const { requirements, isLoading } = useEmployeeMasterFieldRequirements();
  const update = useUpdateSystemSetting();

  const handleToggle = (key: string, checked: boolean) => {
    const next = { ...requirements, [key]: checked };
    // Always-required keys remain true regardless of input.
    for (const f of EMPLOYEE_MASTER_FIELDS) {
      if (f.alwaysRequired) (next as any)[f.key] = true;
    }
    update.mutate({
      key: EMPLOYEE_MASTER_FIELDS_SETTING_KEY,
      // useUpdateSystemSetting deep-clones via JSON.parse(JSON.stringify(value)),
      // so passing the object directly stores it as a JSON object (not a string).
      value: next as unknown as string,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Employee Master Fields
        </CardTitle>
        <CardDescription>
          Configure which fields are required when creating a new user. Fields marked
          mandatory show a small red <RequiredMark /> indicator next to their label on the
          Add New User page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {EMPLOYEE_MASTER_FIELDS.map((f) => {
            const checked = !!requirements[f.key];
            const disabled = !!f.alwaysRequired || isLoading || update.isPending;
            return (
              <div
                key={f.key}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 min-h-[56px]"
              >
                <div className="min-w-0 space-y-0.5">
                  <Label className="text-sm font-medium block truncate">{f.label}</Label>
                  {f.alwaysRequired && (
                    <p className="text-xs text-muted-foreground">Required by system</p>
                  )}
                </div>
                <Switch
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) => handleToggle(f.key, v)}
                  aria-label={`Mandatory: ${f.label}`}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}