import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Pencil } from 'lucide-react';
import { useOverrideIncentiveStatus } from '@/hooks/useProductionTargets';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_OPTIONS = [
  { value: 'hold', label: 'Hold', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'finalised', label: 'Finalised', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'forfeited', label: 'Forfeited', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { value: 'released', label: 'Released', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
];

interface Props {
  recordId: string;
  currentStatus: string;
}

export function IncentiveStatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
      {opt.label}
    </span>
  );
}

export function IncentiveStatusOverride({ recordId, currentStatus }: Props) {
  const { user } = useAuth();
  const override = useOverrideIncentiveStatus();
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [reason, setReason] = useState('');

  const handleSave = () => {
    if (!reason.trim() || newStatus === currentStatus || !user?.id) return;
    override.mutate(
      { id: recordId, incentive_status: newStatus, reason: reason.trim(), overriddenBy: user.id },
      { onSuccess: () => { setOpen(false); setReason(''); } },
    );
  };

  return (
    <div className="flex items-center gap-1">
      <IncentiveStatusBadge status={currentStatus} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="h-6 w-6">
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3" align="end">
          <div>
            <Label className="text-xs">Change Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.filter(s => s.value !== currentStatus).map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reason (required)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1 text-sm" placeholder="Why are you changing the status?" />
          </div>
          <Button size="sm" className="w-full" onClick={handleSave} disabled={override.isPending || !reason.trim() || newStatus === currentStatus}>
            Update Status
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
