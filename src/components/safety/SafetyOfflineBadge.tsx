import { CloudOff, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useSafetyOfflineSync } from '@/hooks/useSafetyOfflineSync';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { OfflineQueueInspector } from '@/components/safety/OfflineQueueInspector';

/**
 * SafetyOfflineBadge
 * ------------------
 * Visible in the Safety header. Shows three states:
 *   - Hidden          → online and queue empty.
 *   - "Offline" chip  → no network. Pending submissions wait safely.
 *   - "N pending"     → online with queued items. Click → manual flush.
 */
export function SafetyOfflineBadge() {
  const { pendingCount, isSyncing, isOnline, flushNow } = useSafetyOfflineSync();
  const { data: settings = [] } = useSafetySettings();
  const inspectorEnabled =
    settings.find((r) => r.key === 'ui_offline_inspector_v1')?.value === true;

  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="gap-1 border-destructive/40 text-destructive"
            >
              <WifiOff className="h-3 w-3" />
              Offline
              {pendingCount > 0 && <span className="ml-1">· {pendingCount} queued</span>}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            You can still submit incidents — they'll send when you reconnect.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const button = (
    <Button
      variant="outline"
      size="sm"
      onClick={inspectorEnabled ? undefined : () => flushNow()}
      disabled={!inspectorEnabled && isSyncing}
      className="gap-1"
    >
      {isSyncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : inspectorEnabled ? (
        <Inbox className="h-3.5 w-3.5" />
      ) : (
        <CloudOff className="h-3.5 w-3.5" />
      )}
      <span className="text-xs">{pendingCount} pending</span>
    </Button>
  );

  if (inspectorEnabled) {
    return <OfflineQueueInspector trigger={button} />;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>Sync queued incident reports now</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}