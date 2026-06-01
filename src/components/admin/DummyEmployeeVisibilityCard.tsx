import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { UserCog } from 'lucide-react';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';

function parseYesNo(raw: unknown): boolean {
  if (typeof raw === 'string') return raw.replace(/^"|"$/g, '').toLowerCase() === 'yes';
  if (typeof raw === 'boolean') return raw;
  return false;
}

export function DummyEmployeeVisibilityCard() {
  const excel = useSystemSetting('show_dummy_in_excel');
  const frontend = useSystemSetting('show_dummy_in_frontend');
  const update = useUpdateSystemSetting();

  const excelOn = parseYesNo(excel.data?.setting_value);
  const frontendOn = parseYesNo(frontend.data?.setting_value);

  const setKey = (key: string, on: boolean) =>
    update.mutate({ key, value: (on ? 'yes' : 'no') });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          Dummy/System Employee Visibility
        </CardTitle>
        <CardDescription>
          Control whether dummy/system employees (e.g. auditor001, test users) appear in
          Excel exports and frontend business views. Admin User Management always shows
          them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">Show in Excel reports</Label>
            <p className="text-sm text-muted-foreground">
              When off, dummy/system employees are excluded from Excel exports.
            </p>
          </div>
          <Switch
            checked={excelOn}
            disabled={excel.isLoading || update.isPending}
            onCheckedChange={(v) => setKey('show_dummy_in_excel', v)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">Show in frontend views</Label>
            <p className="text-sm text-muted-foreground">
              When off, dummy/system employees are hidden from business selectors and lists.
            </p>
          </div>
          <Switch
            checked={frontendOn}
            disabled={frontend.isLoading || update.isPending}
            onCheckedChange={(v) => setKey('show_dummy_in_frontend', v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}