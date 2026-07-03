import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import { hasVoiceFor, speakSequence } from '@/lib/annualReview/speech';

/**
 * Sequentially reads a list of translated strings via the browser's Web
 * Speech API. Same visibility gating as `<SpeakButton>`:
 *   1. `enable_audio` off on the template → hidden
 *   2. current language equals default (nothing to translate-read) → hidden
 *   3. `window.speechSynthesis` undefined → hidden
 *   4. no OS voice for the active language → hidden
 *   5. empty text list → hidden
 */
export function ReadAllButton({ texts, className }: { texts: string[]; className?: string }) {
  const { enableAudio, currentLanguage, defaultLanguage } = useAnnualReviewI18n();
  const [voiceReady, setVoiceReady] = useState<boolean>(() =>
    typeof window !== 'undefined' ? hasVoiceFor(currentLanguage) : false,
  );
  const [progress, setProgress] = useState<{ i: number; total: number } | null>(null);
  const cancelRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => setVoiceReady(hasVoiceFor(currentLanguage));
    refresh();
    synth.addEventListener?.('voiceschanged', refresh);
    return () => synth.removeEventListener?.('voiceschanged', refresh);
  }, [currentLanguage]);

  useEffect(() => () => { cancelRef.current?.(); }, []);

  if (!enableAudio) return null;
  if (!currentLanguage || currentLanguage === defaultLanguage) return null;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  if (!voiceReady) return null;
  const clean = (texts || []).map((t) => (t || '').trim()).filter(Boolean);
  if (clean.length === 0) return null;

  const playing = progress !== null;

  const stop = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setProgress(null);
  };

  const start = () => {
    cancelRef.current?.();
    setProgress({ i: 1, total: clean.length });
    cancelRef.current = speakSequence(clean, currentLanguage, {
      onIndex: (i, total) => setProgress({ i: i + 1, total }),
      onDone: () => {
        cancelRef.current = null;
        setProgress(null);
      },
    });
  };

  return (
    <Button
      type="button"
      variant={playing ? 'secondary' : 'outline'}
      size="sm"
      className={`h-7 gap-1.5 px-2 text-xs ${className ?? ''}`}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); playing ? stop() : start(); }}
      aria-label={playing ? 'Stop reading' : 'Read all aloud'}
      title={playing ? 'Stop reading' : 'Read all aloud'}
    >
      {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      <span className="tabular-nums">
        {playing && progress ? `${progress.i}/${progress.total}` : 'Read all'}
      </span>
    </Button>
  );
}