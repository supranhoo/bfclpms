import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speakSequence } from '@/lib/annualReview/speech';

class MockUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) { this.text = text; }
}

describe('speakSequence', () => {
  let spoken: MockUtterance[];
  let synth: { speak: (u: MockUtterance) => void; cancel: () => void; getVoices: () => never[] };

  beforeEach(() => {
    spoken = [];
    synth = {
      speak: (u: MockUtterance) => {
        spoken.push(u);
        // simulate immediate playback completion
        queueMicrotask(() => u.onend?.());
      },
      cancel: vi.fn(),
      getVoices: () => [],
    };
    (globalThis as any).window = { speechSynthesis: synth };
    (globalThis as any).SpeechSynthesisUtterance = MockUtterance;
  });
  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).SpeechSynthesisUtterance;
  });

  it('speaks each non-empty entry in order and fires onDone', async () => {
    const onDone = vi.fn();
    const onIndex = vi.fn();
    speakSequence(['one', '', '  ', 'two', 'three'], 'hi', { onIndex, onDone });
    await new Promise((r) => setTimeout(r, 20));
    expect(spoken.map((u) => u.text)).toEqual(['one', 'two', 'three']);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onIndex).toHaveBeenCalledTimes(3);
  });

  it('cancel halts further speak() calls', async () => {
    const onDone = vi.fn();
    // Prevent auto-advance so we can cancel mid-flight
    synth.speak = (u: MockUtterance) => { spoken.push(u); };
    const cancel = speakSequence(['a', 'b', 'c'], 'hi', { onDone });
    expect(spoken).toHaveLength(1);
    cancel();
    // simulate the browser finishing the first utterance after cancel
    spoken[0].onend?.();
    await new Promise((r) => setTimeout(r, 10));
    expect(spoken).toHaveLength(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('empty list fires onDone immediately and does not call speak', () => {
    const onDone = vi.fn();
    speakSequence([], 'hi', { onDone });
    expect(spoken).toHaveLength(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});