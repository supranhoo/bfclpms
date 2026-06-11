import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useEmergencySiren — Phase 4 Safety
 * ----------------------------------
 * Generates a two-tone siren via the Web Audio API. No bundled audio asset.
 * Must be invoked from a user-gesture handler or browsers may suspend the
 * AudioContext. Degrades silently when AudioContext is missing.
 */

type WindowWithAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithAudio;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export interface EmergencySirenController {
  isPlaying: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

export function useEmergencySiren(): EmergencySirenController {
  const ctorRef = useRef<typeof AudioContext | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sweepRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  if (ctorRef.current === null) {
    ctorRef.current = getAudioCtor();
  }
  const supported = ctorRef.current != null;

  const stop = useCallback(() => {
    if (sweepRef.current != null) {
      clearInterval(sweepRef.current);
      sweepRef.current = null;
    }
    try { oscRef.current?.stop(); } catch { /* already stopped */ }
    oscRef.current?.disconnect();
    gainRef.current?.disconnect();
    oscRef.current = null;
    gainRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => undefined);
    }
    ctxRef.current = null;
    setIsPlaying(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = ctorRef.current;
    if (!Ctor) return;
    if (oscRef.current) return;
    try {
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 650;
      gain.gain.value = 0.18;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      let high = false;
      sweepRef.current = window.setInterval(() => {
        high = !high;
        try {
          osc.frequency.setValueAtTime(high ? 950 : 650, ctx.currentTime);
        } catch { /* node disposed */ }
      }, 500);
      ctxRef.current = ctx;
      oscRef.current = osc;
      gainRef.current = gain;
      setIsPlaying(true);
    } catch {
      stop();
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { isPlaying, supported, start, stop };
}