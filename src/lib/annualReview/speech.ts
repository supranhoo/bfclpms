/**
 * Web Speech API singleton wrapper for blue-collar self-review read-aloud.
 * See ADR-103. Zero server cost — uses the device's native TTS engine.
 *
 * Design notes:
 * - Chrome's `getVoices()` returns `[]` synchronously on first call; we
 *   wait for the `voiceschanged` event (with a short timeout fallback).
 * - Only one utterance plays at a time — `speak()` cancels any prior one.
 * - Subscribers (e.g. SpeakButton) get notified when the active utterance
 *   changes so they can flip their idle/playing icon.
 */

export type SpeechSubscriber = (activeId: number | null) => void;

let voicesCache: SpeechSynthesisVoice[] | null = null;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;
let nextId = 1;
let activeId: number | null = null;
const subs = new Set<SpeechSubscriber>();

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.speechSynthesis !== 'undefined'
    && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSupported()) return Promise.resolve([]);
  if (voicesCache && voicesCache.length) return Promise.resolve(voicesCache);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const tryGet = () => {
      const v = synth.getVoices();
      if (v && v.length) {
        voicesCache = v;
        resolve(v);
        return true;
      }
      return false;
    };
    if (tryGet()) return;
    const onChange = () => {
      if (tryGet()) {
        synth.removeEventListener?.('voiceschanged', onChange);
      }
    };
    synth.addEventListener?.('voiceschanged', onChange);
    // Fallback: resolve with [] after 600ms so callers stop spinning.
    setTimeout(() => {
      if (!voicesCache) {
        voicesCache = synth.getVoices() ?? [];
        resolve(voicesCache);
      }
    }, 600);
  });
  return voicesPromise;
}

/** Find the best matching voice for a BCP-47 language code (`hi`, `hi-IN`, `es`). */
export async function getVoiceFor(lang: string): Promise<SpeechSynthesisVoice | null> {
  if (!lang) return null;
  const voices = await loadVoices();
  if (!voices.length) return null;
  const lower = lang.toLowerCase();
  const prefix = lower.split('-')[0];
  // Exact match wins, then prefix match, then default-flagged voice in prefix.
  return (
    voices.find((v) => v.lang?.toLowerCase() === lower)
    ?? voices.find((v) => v.lang?.toLowerCase().startsWith(prefix + '-'))
    ?? voices.find((v) => v.lang?.toLowerCase() === prefix)
    ?? null
  );
}

/** Check if any voice exists for `lang` without locking in playback. */
export async function hasVoiceFor(lang: string): Promise<boolean> {
  return (await getVoiceFor(lang)) !== null;
}

export function subscribe(fn: SpeechSubscriber): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function emit() {
  for (const fn of subs) fn(activeId);
}

/** Cancel any current utterance. */
export function cancel(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  if (activeId !== null) {
    activeId = null;
    emit();
  }
}

/**
 * Speak `text` in `lang`. Returns a numeric id for the started utterance, or
 * `null` if speech is unsupported / no voice for the language.
 */
export async function speak(text: string, lang: string): Promise<number | null> {
  if (!isSpeechSupported() || !text?.trim()) return null;
  const voice = await getVoiceFor(lang);
  if (!voice) return null;

  cancel();
  const u = new window.SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang || lang;
  u.rate = 0.95;
  const id = nextId++;
  activeId = id;
  u.onend = () => { if (activeId === id) { activeId = null; emit(); } };
  u.onerror = () => { if (activeId === id) { activeId = null; emit(); } };
  window.speechSynthesis.speak(u);
  emit();
  return id;
}

export function getActiveId(): number | null {
  return activeId;
}

/** Test-only reset of all module-level state. Not used in production. */
export function __resetForTests(): void {
  voicesCache = null;
  voicesPromise = null;
  nextId = 1;
  activeId = null;
  subs.clear();
}