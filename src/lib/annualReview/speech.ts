/**
 * Web Speech API helpers for the Annual Review read-aloud feature.
 * Zero cost — uses the OS TTS engine via `window.speechSynthesis`.
 * All helpers are safe to call in environments where speech synthesis
 * is unavailable; they degrade to no-op / `false`.
 */

function normalizeLang(lang: string): string {
  return (lang || '').toLowerCase();
}

/** True when the current device has at least one voice for the given BCP-47 lang. */
export function hasVoiceFor(lang: string): boolean {
  if (typeof window === 'undefined') return false;
  const synth = window.speechSynthesis;
  if (!synth || typeof synth.getVoices !== 'function') return false;
  const target = normalizeLang(lang);
  if (!target) return false;
  const voices = synth.getVoices() ?? [];
  return voices.some((v) => {
    const vl = normalizeLang(v.lang);
    return vl === target || vl.startsWith(`${target}-`) || target.startsWith(`${vl}-`);
  });
}

/** Speak the given text. No-op when speech synthesis is unavailable. */
export function speak(text: string, lang: string): void {
  if (typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  try {
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(trimmed);
    utter.lang = lang;
    const voices = synth.getVoices?.() ?? [];
    const target = normalizeLang(lang);
    const voice = voices.find((v) => {
      const vl = normalizeLang(v.lang);
      return vl === target || vl.startsWith(`${target}-`) || target.startsWith(`${vl}-`);
    });
    if (voice) utter.voice = voice;
    synth.speak(utter);
  } catch {
    // silent — this is an enhancement, never a blocker.
  }
}

/** Cancel any in-flight utterance. */
export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
}

/**
 * Speak an ordered list of strings back-to-back. Returns a `cancel()`
 * function that halts playback immediately. Empty / whitespace-only entries
 * are skipped. No-op when speech synthesis is unavailable.
 */
export function speakSequence(
  texts: string[],
  lang: string,
  opts?: { onIndex?: (index: number, total: number) => void; onDone?: () => void },
): () => void {
  const clean = (texts || []).map((t) => (t || '').trim()).filter(Boolean);
  if (typeof window === 'undefined' || clean.length === 0) {
    opts?.onDone?.();
    return () => { /* noop */ };
  }
  const synth = window.speechSynthesis;
  if (!synth) {
    opts?.onDone?.();
    return () => { /* noop */ };
  }
  let cancelled = false;
  const voices = synth.getVoices?.() ?? [];
  const target = normalizeLang(lang);
  const voice = voices.find((v) => {
    const vl = normalizeLang(v.lang);
    return vl === target || vl.startsWith(`${target}-`) || target.startsWith(`${vl}-`);
  });
  try { synth.cancel(); } catch { /* noop */ }

  const speakAt = (i: number) => {
    if (cancelled) return;
    if (i >= clean.length) {
      opts?.onDone?.();
      return;
    }
    opts?.onIndex?.(i, clean.length);
    try {
      const utter = new SpeechSynthesisUtterance(clean[i]);
      utter.lang = lang;
      if (voice) utter.voice = voice;
      utter.onend = () => speakAt(i + 1);
      utter.onerror = () => speakAt(i + 1);
      synth.speak(utter);
    } catch {
      speakAt(i + 1);
    }
  };
  speakAt(0);

  return () => {
    cancelled = true;
    try { synth.cancel(); } catch { /* noop */ }
  };
}