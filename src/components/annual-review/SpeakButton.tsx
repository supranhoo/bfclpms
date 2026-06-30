import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, Square } from 'lucide-react';
import {
  isSpeechSupported,
  hasVoiceFor,
  speak,
  cancel,
  subscribe,
  getActiveId,
} from '@/lib/annualReview/speech';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';

interface SpeakButtonProps {
  /** Translated text to read aloud. */
  text: string;
  /** BCP-47 language code (e.g. `hi-IN`). Falls back to context's currentLanguage. */
  lang?: string;
  /** Visual size — defaults to 32px. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * On-demand TTS speaker icon for blue-collar self-review.
 * Returns `null` (silent graceful degrade) when:
 *  - the template has `enable_audio !== true`
 *  - the active language equals the default (nothing to translate/read)
 *  - the browser does not support Web Speech API
 *  - the device has no voice installed for the active language
 */
export function SpeakButton({ text, lang, size = 'md', className }: SpeakButtonProps) {
  const { enableAudio, currentLanguage, defaultLanguage } = useAnnualReviewI18n();
  const targetLang = lang || currentLanguage;
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null);
  const [myId, setMyId] = useState<number | null>(null);

  const shouldRender =
    enableAudio === true
    && !!text?.trim()
    && !!targetLang
    && targetLang !== defaultLanguage
    && isSpeechSupported();

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    void hasVoiceFor(targetLang).then((ok) => {
      if (!cancelled) setVoiceReady(ok);
    });
    return () => { cancelled = true; };
  }, [shouldRender, targetLang]);

  useEffect(() => {
    if (!shouldRender) return;
    return subscribe((active) => {
      // If a *different* utterance starts, drop our playing state.
      if (myId !== null && active !== myId) setMyId(null);
    });
  }, [shouldRender, myId]);

  if (!shouldRender || voiceReady === false) return null;

  const isPlaying = myId !== null && getActiveId() === myId;
  const px = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const ariaLabel = isPlaying ? 'Stop' : 'Listen';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      aria-pressed={isPlaying}
      disabled={voiceReady === null}
      className={`${px} shrink-0 text-muted-foreground hover:text-foreground ${className ?? ''}`}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (isPlaying) {
          cancel();
          setMyId(null);
          return;
        }
        const id = await speak(text, targetLang);
        if (id !== null) setMyId(id);
      }}
    >
      {isPlaying ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  );
}