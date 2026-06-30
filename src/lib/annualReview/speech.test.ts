import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isSpeechSupported,
  getVoiceFor,
  hasVoiceFor,
  speak,
  cancel,
  __resetForTests,
} from './speech';

function installSynthMock(voices: Array<{ lang: string; name: string }>) {
  const listeners: Record<string, Array<() => void>> = {};
  const synth = {
    getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: (ev: string, fn: () => void) => {
      (listeners[ev] ||= []).push(fn);
    },
    removeEventListener: (ev: string, fn: () => void) => {
      listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
    },
  };
  // @ts-expect-error test injection
  globalThis.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (text: string) { this.text = text; } } as unknown as Window;
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    (globalThis.window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance;
  return { synth };
}

describe('annualReview/speech', () => {
  beforeEach(() => {
    __resetForTests();
    // @ts-expect-error reset
    delete globalThis.window;
  });

  it('isSpeechSupported = false when window missing', () => {
    expect(isSpeechSupported()).toBe(false);
  });

  it('isSpeechSupported = true when speechSynthesis exists', () => {
    installSynthMock([{ lang: 'hi-IN', name: 'Hindi' }]);
    expect(isSpeechSupported()).toBe(true);
  });

  it('getVoiceFor matches by language prefix (hi -> hi-IN)', async () => {
    installSynthMock([
      { lang: 'en-US', name: 'English' },
      { lang: 'hi-IN', name: 'Hindi' },
    ]);
    const v = await getVoiceFor('hi');
    expect(v?.lang).toBe('hi-IN');
  });

  it('hasVoiceFor returns false when no matching voice', async () => {
    installSynthMock([{ lang: 'en-US', name: 'English' }]);
    expect(await hasVoiceFor('hi')).toBe(false);
  });

  it('speak() is a no-op (returns null) without a matching voice', async () => {
    const { synth } = installSynthMock([{ lang: 'en-US', name: 'English' }]);
    const id = await speak('नमस्ते', 'hi');
    expect(id).toBeNull();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speak() cancels prior utterance and dispatches a new one', async () => {
    const { synth } = installSynthMock([{ lang: 'hi-IN', name: 'Hindi' }]);
    const id1 = await speak('एक', 'hi');
    const id2 = await speak('दो', 'hi');
    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(id1).not.toBe(id2);
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(2);
  });

  it('cancel() clears the active utterance', async () => {
    installSynthMock([{ lang: 'hi-IN', name: 'Hindi' }]);
    await speak('परीक्षण', 'hi');
    cancel();
    // No throw; subsequent speak() should still work.
    const id = await speak('फिर', 'hi');
    expect(id).not.toBeNull();
  });
});