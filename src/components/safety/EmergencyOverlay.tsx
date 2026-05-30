/**
 * Phase 5 — Emergency Overlay (UI-only)
 * -------------------------------------
 * Sheet surfacing emergency contacts and a one-tap "Report incident" CTA.
 * Reads `safety_settings` only — introduces zero new writers, RPCs, or
 * external API calls. `tel:` links are inert anchors.
 */
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Inbox, Phone, Siren } from 'lucide-react';
import { useSafetySettings } from '@/hooks/useSafetySettings';

export type EmergencyContact = {
  label: string;
  phone: string;
  role?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

function parseContacts(raw: unknown): EmergencyContact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      label: String(r.label ?? '').trim(),
      phone: String(r.phone ?? '').trim(),
      role: r.role ? String(r.role).trim() : undefined,
    }))
    .filter((c) => c.label && c.phone);
}

export function EmergencyOverlay({ open, onOpenChange, trigger }: Props) {
  const navigate = useNavigate();
  const { data: settings = [] } = useSafetySettings();

  const contacts = parseContacts(
    settings.find((r) => r.key === 'emergency_contacts')?.value,
  );
  const inspectorEnabled =
    settings.find((r) => r.key === 'ui_offline_inspector_v1')?.value === true;

  const handleReport = () => {
    onOpenChange(false);
    navigate('/safety/incidents/new');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        side="bottom"
        className="rounded-t-2xl sm:rounded-2xl sm:right-4 sm:bottom-4 sm:top-auto sm:left-auto sm:max-w-sm sm:h-auto flex flex-col"
        data-testid="emergency-overlay"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-destructive">
            <Siren className="h-5 w-5" />
            Emergency
          </SheetTitle>
          <SheetDescription>
            Reach safety responders or log an incident immediately.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {contacts.length > 0 && (
            <ul className="mt-3 space-y-2" data-testid="emergency-contacts">
              {contacts.map((c, i) => (
                <li key={`${c.phone}-${i}`}>
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, '')}`}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 min-h-[44px] hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.label}</p>
                      {c.role && (
                        <p className="text-xs text-muted-foreground truncate">{c.role}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                    <Phone className="h-4 w-4 text-destructive shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              No emergency contacts configured. Ask an admin to add some in Safety Settings.
            </p>
          )}

          <Separator className="my-4" />

          <div className="space-y-2 pb-4">
            <Button
              variant="destructive"
              className="w-full gap-2 min-h-[44px]"
              onClick={handleReport}
              data-testid="emergency-report-cta"
            >
              <AlertTriangle className="h-4 w-4" />
              Report incident now
            </Button>
            {inspectorEnabled && (
              <p className="text-xs text-muted-foreground text-center inline-flex items-center justify-center gap-1 w-full">
                <Inbox className="h-3 w-3" />
                Queued submissions are visible from the Safety header.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}