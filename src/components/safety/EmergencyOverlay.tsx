/**
 * Phase 5 + Phase 8 — Emergency Overlay (UI-only)
 * -----------------------------------------------
 * Sheet surfacing emergency contacts and a one-tap "Report incident" CTA.
 * Phase 8 reconciliation: reads the SSOT `safety_emergency_contacts` table
 * via `useEmergencyContacts` (read-only hook). The overlay introduces zero
 * new writers, RPCs, or external API calls. `tel:` links are inert anchors.
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Inbox, Mail, Phone, Siren } from 'lucide-react';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { useEmergencyContacts } from '@/hooks/useSafetyEmergency';
import { SAFETY_EMERGENCY_CONTACT_TYPE_LABEL } from '@/lib/safetyEmergency';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function EmergencyOverlay({ open, onOpenChange, trigger }: Props) {
  const navigate = useNavigate();
  const { data: settings = [] } = useSafetySettings();
  // Phase 8 SSOT: pull from the typed contacts table, active-only.
  const { data: contacts = [] } = useEmergencyContacts({ type: 'all', activeOnly: true });
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
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border bg-card p-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.role_title && (
                        <p className="text-xs text-muted-foreground truncate">
                          {c.role_title}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {SAFETY_EMERGENCY_CONTACT_TYPE_LABEL[c.contact_type]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <a
                      href={`tel:${c.phone_primary.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-destructive min-h-[36px] hover:underline"
                    >
                      <Phone className="h-4 w-4" /> {c.phone_primary}
                    </a>
                    {c.phone_alt && (
                      <a
                        href={`tel:${c.phone_alt.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-2 text-xs text-muted-foreground min-h-[32px] hover:underline"
                      >
                        <Phone className="h-3 w-3" /> {c.phone_alt}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-2 text-xs text-muted-foreground min-h-[32px] hover:underline"
                      >
                        <Mail className="h-3 w-3" /> {c.email}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              No emergency contacts configured.{' '}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => {
                  onOpenChange(false);
                  navigate('/safety/emergency/contacts');
                }}
              >
                Open the directory
              </button>{' '}
              to add one.
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