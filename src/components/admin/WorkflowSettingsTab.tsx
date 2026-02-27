import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, AlertTriangle, FileCheck, Eye, FileDown } from 'lucide-react';
import { useAllWorkflowSettings, useUpdateWorkflowSetting, WorkflowSetting, SettingCategory } from '@/hooks/useWorkflowSettings';
import { useState, useEffect } from 'react';
import { ALL_APP_ROLES } from '@/lib/roles';
import { ALL_COLUMN_KEYS, COLUMN_REGISTRY } from '@/lib/kraExport';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface SettingInputProps {
  setting: WorkflowSetting;
  onUpdate: (key: string, value: string | number | boolean) => void;
  isPending: boolean;
}

function SettingInput({ setting, onUpdate, isPending }: SettingInputProps) {
  const [localValue, setLocalValue] = useState<string | number | boolean>(setting.setting_value);
  const [isDirty, setIsDirty] = useState(false);
  
  useEffect(() => {
    setLocalValue(setting.setting_value);
    setIsDirty(false);
  }, [setting.setting_value]);
  
  const handleChange = (newValue: string | number | boolean) => {
    setLocalValue(newValue);
    setIsDirty(newValue !== setting.setting_value);
  };
  
  const handleBlur = () => {
    if (isDirty) {
      onUpdate(setting.setting_key, localValue);
      setIsDirty(false);
    }
  };
  
  // Role array setting (for export role configs)
  if (setting.setting_key.endsWith('_roles') && (setting.category === 'export' || setting.category === 'observation')) {
    const currentRoles: string[] = (() => {
      try {
        const val = typeof localValue === 'string' ? JSON.parse(localValue) : localValue;
        return Array.isArray(val) ? val : [];
      } catch { return []; }
    })();

    const toggleRole = (role: string) => {
      const updated = currentRoles.includes(role)
        ? currentRoles.filter(r => r !== role)
        : [...currentRoles, role];
      const json = JSON.stringify(updated);
      handleChange(json);
      onUpdate(setting.setting_key, json);
    };

    return (
      <div className="py-4 border-b last:border-0 space-y-3">
        <div className="space-y-1">
          <Label className="text-base font-medium">{setting.label}</Label>
          <p className="text-sm text-muted-foreground">{setting.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_APP_ROLES.map(role => (
            <label key={role} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={currentRoles.includes(role)}
                onCheckedChange={() => toggleRole(role)}
                disabled={isPending}
              />
              <span className="text-sm capitalize">{role.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  // Column array setting (for export columns)
  if (setting.setting_key === 'kra_export_columns') {
    const currentCols: string[] = (() => {
      try {
        const val = typeof localValue === 'string' ? JSON.parse(localValue) : localValue;
        return Array.isArray(val) ? val : [];
      } catch { return []; }
    })();

    const toggleCol = (col: string) => {
      const updated = currentCols.includes(col)
        ? currentCols.filter(c => c !== col)
        : [...currentCols, col];
      const json = JSON.stringify(updated);
      handleChange(json);
      onUpdate(setting.setting_key, json);
    };

    return (
      <div className="py-4 border-b last:border-0 space-y-3">
        <div className="space-y-1">
          <Label className="text-base font-medium">{setting.label}</Label>
          <p className="text-sm text-muted-foreground">{setting.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_COLUMN_KEYS.map(col => {
            const def = COLUMN_REGISTRY[col];
            return (
              <label key={col} className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={currentCols.includes(col)}
                  onCheckedChange={() => toggleCol(col)}
                  disabled={isPending}
                />
                <span className="text-sm">{def?.header || col}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // Boolean switch
  if (setting.min_value === null && setting.max_value === null && typeof setting.setting_value === 'boolean') {
    return (
      <div className="flex items-center justify-between py-4 border-b last:border-0">
        <div className="flex-1 space-y-1 pr-4">
          <Label className="text-base font-medium">{setting.label}</Label>
          <p className="text-sm text-muted-foreground">{setting.description}</p>
        </div>
        <Switch
          checked={localValue as boolean}
          onCheckedChange={(checked) => {
            handleChange(checked);
            onUpdate(setting.setting_key, checked);
          }}
          disabled={isPending}
        />
      </div>
    );
  }
  
  // Slider for numeric values with range
  if (setting.min_value !== null && setting.max_value !== null) {
    const numValue = typeof localValue === 'number' ? localValue : parseInt(String(localValue), 10) || 0;
    
    return (
      <div className="py-4 border-b last:border-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-base font-medium">{setting.label}</Label>
            <p className="text-sm text-muted-foreground">{setting.description}</p>
          </div>
          <div className="flex items-center gap-2 min-w-[100px] justify-end">
            <span className="text-lg font-semibold tabular-nums">{numValue}</span>
            {setting.unit && <span className="text-sm text-muted-foreground">{setting.unit}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground w-8">{setting.min_value}</span>
          <Slider
            value={[numValue]}
            min={setting.min_value}
            max={setting.max_value}
            step={1}
            onValueChange={([val]) => handleChange(val)}
            onValueCommit={([val]) => onUpdate(setting.setting_key, val)}
            disabled={isPending}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8 text-right">{setting.max_value}</span>
        </div>
      </div>
    );
  }
  
  // Regular numeric input
  return (
    <div className="flex items-center justify-between py-4 border-b last:border-0">
      <div className="flex-1 space-y-1 pr-4">
        <Label className="text-base font-medium">{setting.label}</Label>
        <p className="text-sm text-muted-foreground">{setting.description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={localValue as number}
          onChange={(e) => handleChange(parseInt(e.target.value, 10) || 0)}
          onBlur={handleBlur}
          disabled={isPending}
          className="w-20 text-center"
        />
        {setting.unit && <span className="text-sm text-muted-foreground">{setting.unit}</span>}
      </div>
    </div>
  );
}

const CATEGORY_CONFIG: Record<SettingCategory, { title: string; description: string; icon: React.ReactNode }> = {
  submission: {
    title: 'Submission Windows',
    description: 'Configure time windows for daily submissions and resubmissions',
    icon: <Clock className="h-5 w-5" />,
  },
  sla: {
    title: 'SLA Thresholds',
    description: 'Set warning and critical thresholds for various workflow items',
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  validation: {
    title: 'Validation Rules',
    description: 'Configure validation requirements for form submissions',
    icon: <FileCheck className="h-5 w-5" />,
  },
  observation: {
    title: 'Observation Settings',
    description: 'Configure how observations impact scores',
    icon: <Eye className="h-5 w-5" />,
  },
  export: {
    title: 'Export Settings',
    description: 'Configure KRA export permissions, visible columns, and PDF layout',
    icon: <FileDown className="h-5 w-5" />,
  },
};

const CATEGORY_ORDER: SettingCategory[] = ['submission', 'sla', 'validation', 'observation', 'export'];

export function WorkflowSettingsTab() {
  const { grouped, isLoading, error } = useAllWorkflowSettings();
  const updateSetting = useUpdateWorkflowSetting();
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Settings</CardTitle>
          <CardDescription>{(error as Error).message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  const handleUpdate = (key: string, value: string | number | boolean) => {
    updateSetting.mutate({ key, value });
  };
  
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const config = CATEGORY_CONFIG[category];
        const settings = grouped[category] || [];
        
        if (settings.length === 0) return null;
        
        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {config.icon}
                {config.title}
              </CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {settings.map((setting) => (
                <SettingInput
                  key={setting.id}
                  setting={setting}
                  onUpdate={handleUpdate}
                  isPending={updateSetting.isPending}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
