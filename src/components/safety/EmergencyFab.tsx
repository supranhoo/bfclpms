/**
 * Phase 5 — Emergency FAB (UI-only)
 * ---------------------------------
 * Fixed bottom-right action button mounted in SafetyLayout when
 * `ui_emergency_overlay_v1` is ON. Opens the Emergency overlay sheet.
 * Respects prefers-reduced-motion; min 44px touch target.
 */
import { useState } from 'react';
import { Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { EmergencyOverlay } from './EmergencyOverlay';

export function EmergencyFab() {
  const [open, setOpen] = useState(false);
  const { data: settings = [] } = useSafetySettings();
  const enabled =
    settings.find((r) => r.key === 'ui_emergency_overlay_v1')?.value === true;

  if (!enabled) return null;

  return (
    <>
      <div
        className="fixed bottom-20 right-4 z-40 md:bottom-6"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        data-testid="emergency-fab-wrap"
      >
        <Button
          variant="destructive"
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg motion-safe:hover:scale-105 transition-transform"
          onClick={() => setOpen(true)}
          aria-label="Open emergency overlay"
          data-testid="emergency-fab"
        >
          <Siren className="h-6 w-6" />
        </Button>
      </div>
      <EmergencyOverlay open={open} onOpenChange={setOpen} />
    </>
  );
}