// animator.js: drives any step generator at a controllable rate.
//
// Steps are consumed on requestAnimationFrame with a fractional "budget", so
// the rate can range from a couple of steps per second up to thousands, and
// it can change while running. Used by the lab, the maze generators and race
// mode alike.

/** Map the 1–100 speed slider to steps per second (roughly 2 to 3000, exponential). */
export const speedToRate = (v) => 2 * Math.pow(1500, v / 100);

export function speedLabel(v) {
  if (v < 15) return 'Crawl';
  if (v < 35) return 'Slow';
  if (v < 65) return 'Normal';
  if (v < 88) return 'Fast';
  return 'Ludicrous';
}

const MAX_STEPS_PER_FRAME = 1500;

export class Animator {
  constructor(getRate) {
    this.getRate = getRate;
    this.running = false;
    this.paused = false;
    this.elapsed = 0;
    this.tick = this.tick.bind(this);
  }

  /**
   * Start consuming `iter`. Resolves true when the generator finishes, or
   * false if stop() is called first.
   */
  run(iter, { onStep, onFrame, rateScale = 1, paused = false } = {}) {
    this.stop();
    return new Promise((resolve) => {
      Object.assign(this, { iter, onStep, onFrame, rateScale, resolve });
      this.budget = 0;
      this.elapsed = 0;
      this.paused = paused;
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    });
  }

  tick(t) {
    if (!this.running) return;
    const dt = Math.min(100, Math.max(0, t - this.last));
    this.last = t;
    if (!this.paused) {
      this.elapsed += dt;
      this.budget += (dt / 1000) * this.getRate() * this.rateScale;
      let n = Math.floor(this.budget);
      if (n > MAX_STEPS_PER_FRAME) { n = MAX_STEPS_PER_FRAME; this.budget = 0; }
      else this.budget -= n;
      while (n-- > 0) if (!this.advance()) return;
      if (this.onFrame) this.onFrame();
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  advance() {
    const r = this.iter.next();
    if (r.done) { this.finish(true); return false; }
    this.onStep(r.value);
    return true;
  }

  finish(completed) {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.onFrame) this.onFrame();
    const resolve = this.resolve;
    this.resolve = null;
    if (resolve) resolve(completed);
  }

  /** Advance exactly one step (pauses the animation). */
  step() {
    if (!this.running) return;
    this.paused = true;
    if (this.advance() && this.onFrame) this.onFrame();
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this.last = performance.now(); }
  stop() { if (this.running) this.finish(false); }
}
