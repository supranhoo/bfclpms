import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { SafetyUserPicker } from '@/components/safety/SafetyUserPicker';
import { useSafetySettings, useUpsertSafetySetting } from '@/hooks/useSafetySettings';
import { toast } from 'sonner';

const KEY = 'global_safety_head_id';

/**
 * Global Safety Head — a single person who handles the Safety Head Review
 * stage across ALL business units. Stored as a JSON string in
 * `safety_settings.global_safety_head_id`. Independent of per-BU incident
 * routing rules.
 */
export default function SafetyHeadAssignmentTab() {
  const { data: rows = [], isLoading } = useSafetySettings();
  const upsert = useUpsertSafetySetting();

  const currentId = useMemo(() => {
    const row = rows.find((r) => r.key === KEY);
    const v = row?.value;
    if (typeof v === 'string' && v.length > 0) return v;
    return '';
  }, [rows]);

  const handleChange = (next: string) => {
    upsert.mutate(
      { key: KEY, value: next || null, description: 'Global Safety Head (handles Safety Head Review across all BUs)' },
      {
        onSuccess: () => toast.success(next ? 'Safety Head updated' : 'Safety Head cleared'),
        onError: (e: unknown) => toast.error((e as Error).message ?? 'Failed to save'),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Safety Head Assignment
        </CardTitle>
        <CardDescription>
          Designate the single Safety Head who owns the Safety Head Review stage for every Business Unit.
          This is independent of per-BU incident routing (BU Head / Manager / 2nd Manager) configured above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label className="text-xs">Safety Head</Label>
        {isLoading ? (
          <div className="flex items-center py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <SafetyUserPicker
            value={currentId}
            onChange={handleChange}
            placeholder="Select Safety Head"
          />
        )}
        {upsert.isPending && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
      </CardContent>
    </Card>
  );
}