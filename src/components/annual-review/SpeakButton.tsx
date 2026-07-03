import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import { hasVoiceFor, speak } from '@/lib/annualReview/speech';

/**
 * Speaker icon that reads translated text aloud via the browser's Web
 * Speech API. Renders `null` (silent — no layout shift) when:
 *   1. `enable_audio` is off on the template
 *   2. current language equals the default language (nothing to read)
 *   3. `window.speechSynthesis` is undefined
 *   4. no OS voice is installed for the active language
 */
export function SpeakButton({ text, className }: { text: string; className?: string }) {
  const { enableAudio, currentLanguage, defaultLanguage } = useAnnualReviewI18n();
  const [voiceReady, setVoiceReady] = useState<boolean>(() =>
    typeof window !== 'undefined' ? hasVoiceFor(currentLanguage) : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => setVoiceReady(hasVoiceFor(currentLanguage));
    refresh();
    // Some browsers load voices asynchronously.
    synth.addEventListener?.('voiceschanged', refresh);
    return () => synth.removeEventListener?.('voiceschanged', refresh);
  }, [currentLanguage]);

  if (!enableAudio) return null;
  if (!currentLanguage || currentLanguage === defaultLanguage) return null;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  if (!voiceReady) return null;
  const clean = (text || '').trim();
  if (!clean) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground ${className ?? ''}`}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); speak(clean, currentLanguage); }}
      aria-label="Read aloud"
      title="Read aloud"
    >
      <Volume2 className="h-3.5 w-3.5" />
    </Button>
  );
}