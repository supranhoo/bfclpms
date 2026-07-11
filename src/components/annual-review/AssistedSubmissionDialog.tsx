import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Camera, RefreshCw, ShieldCheck, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { submitWithAssistance } from '@/services/annualReview/proxySubmission';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instanceId: string;
  employeeUserId: string;
  employeeName: string;
  proxyRoleLabel: string;
  proxyDisplayName: string;
  onSubmitted?: () => void;
}

const DECLARATION =
  'I confirm the responses recorded are the employee\'s own. The employee is physically present and a live photograph has been captured as verification.';
const DECLARATION_NO_PHOTO =
  'I confirm the responses recorded are the employee\'s own and the employee is physically present.';

const APP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export function AssistedSubmissionDialog({
  open, onOpenChange, instanceId, employeeUserId, employeeName, proxyRoleLabel, proxyDisplayName, onSubmitted,
}: Props) {
  const { t } = useAnnualReviewI18n();
  const localizedRole = t(`assisted.role.${proxyRoleLabel}`, proxyRoleLabel);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Blob | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoSkipped, setPhotoSkipped] = useState(false);

  const { data: selfieRequired = true } = useQuery({
    queryKey: ['assisted-selfie-required'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('assisted_selfie_required')
        .eq('id', APP_SETTINGS_ID)
        .maybeSingle();
      if (error) return true;
      return data?.assisted_selfie_required !== false;
    },
  });

  const declarationText = selfieRequired ? DECLARATION : DECLARATION_NO_PHOTO;
  const declarationDisplay = selfieRequired
    ? t('assisted.declaration', DECLARATION)
    : t('assisted.declaration.noPhoto', DECLARATION_NO_PHOTO);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      stopStream();
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
      setSnapshot(null); setSnapshotUrl(null); setAccepted(false); setStreamErr(null); setPhotoSkipped(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        setStreamErr((e as Error).message || t('assisted.camera.unavailable', 'Camera unavailable. Allow camera access and retry.'));
      }
    })();
    return () => { cancelled = true; stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
      setSnapshot(blob);
      setSnapshotUrl(URL.createObjectURL(blob));
      stopStream();
    }, 'image/jpeg', 0.9);
  };

  const retake = async () => {
    if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
    setSnapshot(null); setSnapshotUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
    } catch (e) {
      setStreamErr((e as Error).message || t('assisted.camera.unavailable', 'Camera unavailable.'));
    }
  };

  const submit = async () => {
    if (!accepted) return;
    if (selfieRequired && !snapshot) return;
    setSubmitting(true);
    try {
      await submitWithAssistance({
        instanceId,
        employeeUserId,
        proxyRoleLabel,
        selfieBlob: snapshot ?? null,
        declarationText,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      toast.success(t('assisted.toast.recorded', 'Assisted submission recorded.'));
      onSubmitted?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || t('assisted.toast.failed', 'Submission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const descTemplate = selfieRequired
    ? t(
        'assisted.dialog.desc',
        'Submitting on behalf of {employee} as {proxy} ({role}). A live photo of the employee is required and will be retained as audit evidence.',
      )
    : t(
        'assisted.dialog.desc.noPhoto',
        'Submitting on behalf of {employee} as {proxy} ({role}). A live photo is optional; the signed declaration will be retained as audit evidence.',
      );
  const descParts = descTemplate
    .split(/(\{employee\}|\{proxy\}|\{role\})/g)
    .map((seg, i) => {
      if (seg === '{employee}') return <strong key={i}>{employeeName}</strong>;
      if (seg === '{proxy}') return <strong key={i}>{proxyDisplayName}</strong>;
      if (seg === '{role}') return <span key={i}>{localizedRole}</span>;
      return <span key={i}>{seg}</span>;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> {t('assisted.dialog.title', 'Assisted Submission Verification')}
          </DialogTitle>
          <DialogDescription>
            {descParts}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!photoSkipped && (
            <>
              <div className="aspect-video w-full bg-black/80 rounded-md overflow-hidden flex items-center justify-center">
                {snapshotUrl ? (
                  <img src={snapshotUrl} alt="Captured selfie preview" className="w-full h-full object-cover" />
                ) : (
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                )}
              </div>
              {streamErr && (
                <p className={selfieRequired ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                  {streamErr}
                </p>
              )}
              <canvas ref={canvasRef} className="hidden" />

              <div className="flex flex-wrap gap-2">
                {!snapshot ? (
                  <Button type="button" variant="secondary" onClick={capture} disabled={!!streamErr} className="gap-1.5">
                    <Camera className="h-4 w-4" /> {t('assisted.btn.capture', 'Capture selfie')}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={retake} className="gap-1.5">
                    <RefreshCw className="h-4 w-4" /> {t('assisted.btn.retake', 'Retake')}
                  </Button>
                )}
                {!selfieRequired && !snapshot && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { stopStream(); setPhotoSkipped(true); }}
                    className="gap-1.5"
                  >
                    <SkipForward className="h-4 w-4" /> {t('assisted.btn.skip', 'Continue without photo')}
                  </Button>
                )}
              </div>
            </>
          )}
          {photoSkipped && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
              <span>{t('assisted.btn.skip', 'Continue without photo')}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setPhotoSkipped(false); void retake(); }}
              >
                <Camera className="h-4 w-4 mr-1" /> {t('assisted.btn.capture', 'Capture selfie')}
              </Button>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm leading-snug">
            <Checkbox
              checked={accepted}
              onCheckedChange={(v) => setAccepted(v === true)}
              disabled={selfieRequired && !snapshot}
            />
            <span>{declarationDisplay}</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>{t('assisted.btn.cancel', 'Cancel')}</Button>
          <Button onClick={submit} disabled={(selfieRequired && !snapshot) || !accepted || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('assisted.btn.submit', 'Verify & Submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}