// Retro sound effects synthesized at runtime with WebAudio: no audio files to load.
// Browsers (especially on Android) block audio until the first tap, so unlock() is
// called from the first pointer event.

import type { TypeId } from '../core/types';
import { settings } from '../settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio unavailable */ }
}

const ok = () => settings.sound && ctx && master && ctx.state === 'running';

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.15, slideTo?: number, delay = 0) {
  if (!ok()) return;
  const t = ctx!.currentTime + delay;
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, filter: BiquadFilterType = 'lowpass', freq = 1200, freqTo?: number, delay = 0) {
  if (!ok() || !noiseBuf) return;
  const t = ctx!.currentTime + delay;
  const s = ctx!.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx!.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master!);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  tap: () => tone(660, 0.05, 'square', 0.08),
  back: () => tone(440, 0.07, 'square', 0.08, 300),
  confirm: () => { tone(520, 0.06, 'square', 0.1); tone(780, 0.09, 'square', 0.1, undefined, 0.06); },
  error: () => { tone(180, 0.12, 'square', 0.12); tone(140, 0.14, 'square', 0.12, undefined, 0.08); },
  slam: () => { noise(0.25, 0.4, 'lowpass', 400, 80); tone(70, 0.25, 'sine', 0.35, 40); },
  slide: () => noise(0.12, 0.12, 'bandpass', 2400, 900),
  tick: (pitch = 1) => tone(1400 * pitch, 0.018, 'square', 0.05),
  land: () => { tone(900, 0.04, 'square', 0.12); noise(0.05, 0.15, 'highpass', 3000); },
  tension: () => { tone(60, 0.5, 'sine', 0.3); tone(60, 0.5, 'sine', 0.25, undefined, 0.5); },
  clash: (t?: TypeId) => {
    switch (t) {
      case 'rock': noise(0.3, 0.45, 'lowpass', 700, 90); tone(90, 0.2, 'triangle', 0.3, 50); break;
      case 'paper': noise(0.25, 0.25, 'highpass', 3500, 6000); break;
      case 'scissors': tone(2400, 0.25, 'triangle', 0.12, 1800); tone(3200, 0.2, 'sine', 0.08); break;
      case 'flame': noise(0.4, 0.35, 'bandpass', 500, 2500); break;
      case 'tide': noise(0.45, 0.3, 'bandpass', 1800, 300); tone(300, 0.3, 'sine', 0.1, 120); break;
      default: noise(0.15, 0.3, 'bandpass', 1500);
    }
  },
  win: () => { tone(392, 0.08, 'square', 0.12); tone(523, 0.08, 'square', 0.12, undefined, 0.07); tone(784, 0.16, 'square', 0.12, undefined, 0.14); },
  loss: () => { noise(0.3, 0.45, 'lowpass', 300, 60); tone(110, 0.3, 'sawtooth', 0.15, 55); },
  tie: () => { tone(1200, 0.35, 'triangle', 0.12, 1150); tone(1270, 0.35, 'triangle', 0.1, 1220); noise(0.08, 0.2, 'highpass', 5000); },
  crit: () => { tone(1800, 0.05, 'square', 0.14); tone(2400, 0.2, 'square', 0.12, 1200, 0.05); },
  jackpot: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'square', 0.12, undefined, i * 0.07)); noise(0.6, 0.12, 'highpass', 6000, undefined, 0.3); },
  coin: (level = 1) => { const f = 900 + level * 160; tone(f, 0.05, 'square', 0.1); tone(f * 1.5, 0.12, 'square', 0.09, undefined, 0.05); },
  dice: () => { for (let i = 0; i < 5; i++) noise(0.03, 0.18, 'bandpass', 2000 + Math.random() * 1500, undefined, i * 0.05); },
  burn: () => noise(0.2, 0.2, 'bandpass', 700, 2000),
  heal: () => { tone(660, 0.12, 'sine', 0.1, 990); tone(990, 0.15, 'sine', 0.08, 1320, 0.08); },
  armor: () => { tone(1500, 0.06, 'square', 0.08); noise(0.06, 0.15, 'highpass', 4000); },
  reward: () => { tone(660, 0.08, 'square', 0.1); tone(880, 0.08, 'square', 0.1, undefined, 0.08); tone(1100, 0.15, 'square', 0.1, undefined, 0.16); },
  victory: () => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.11, undefined, i * 0.12)); },
  defeat: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.14, undefined, i * 0.22)); },
  fuse: () => { noise(0.6, 0.5, 'lowpass', 1500, 60); tone(80, 0.5, 'sawtooth', 0.2, 30); },
};
