// sound.js: chiptune sound effects synthesised with the Web Audio API.
// Sound is OFF by default; the AudioContext is only created after the player
// switches it on (which also satisfies browsers' autoplay rules).

let ctx = null;
let enabled = false;
const last = {};

export function setSound(on) {
  enabled = on;
  if (on) {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
}

export const isSoundOn = () => enabled;

function tone(freq, dur, { type = 'square', vol = 0.05, slide = 0, when = 0 } = {}) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.setValueAtTime(vol, t + dur * 0.75);
  gain.gain.linearRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Skip a sound if the same kind played less than `ms` ago (keeps fast runs from turning into noise). */
function throttle(kind, ms) {
  const now = performance.now();
  if (last[kind] && now - last[kind] < ms) return true;
  last[kind] = now;
  return false;
}

const seq = (notes, step, opts) => notes.forEach((f, i) => f && tone(f, step * 0.9, { ...opts, when: i * step }));

export const sfx = {
  click() { tone(660, 0.04, { vol: 0.04 }); },
  select() { tone(523, 0.05); tone(784, 0.07, { when: 0.05 }); },
  /** Exploration blip: pitch climbs as the search spreads. */
  explore(n) {
    if (throttle('explore', 55)) return;
    tone(196 + ((n * 23) % 520), 0.035, { vol: 0.025 });
  },
  carve() {
    if (throttle('carve', 60)) return;
    tone(110 + Math.random() * 90, 0.03, { type: 'triangle', vol: 0.06 });
  },
  type() {
    if (throttle('type', 45)) return;
    tone(1180, 0.012, { vol: 0.012 });
  },
  found() { seq([523, 659, 784, 1047, 0, 1319], 0.08, { vol: 0.05 }); },
  fail() { seq([392, 330, 262, 196], 0.12, { type: 'triangle', vol: 0.08 }); },
  count() { tone(440, 0.14, { vol: 0.06 }); },
  go() { tone(880, 0.35, { vol: 0.06, slide: 220 }); },
  finish() { tone(988, 0.06, { vol: 0.04 }); tone(1319, 0.09, { vol: 0.04, when: 0.06 }); },
  win() {
    seq([523, 523, 523, 659, 0, 784, 659, 784, 1047], 0.11, { vol: 0.05 });
    seq([131, 0, 165, 0, 196, 0, 262], 0.15, { type: 'triangle', vol: 0.07 });
  },
  letter() { tone(880, 0.03, { vol: 0.04 }); },
  saved() { seq([784, 988, 1175, 1568], 0.07, { vol: 0.05 }); },
};
