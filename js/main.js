// main.js: wires the page together: shared app state, mode switching,
// the speed sliders, the landing animation and the "Learn" section.
//
// Future modes (street map, race-the-algorithm game, 3D) can plug in here as
// additional views alongside Explore and Race.

import { Lab, $ } from './ui.js';
import { Race } from './race.js';
import { renderLearn } from './explain.js';
import { startHero } from './hero.js';
import { speedToRate, speedLabel } from './animator.js';

const app = {
  speed: 55,
  mode: 'explore',
  get rate() { return speedToRate(this.speed); },
};

const lab = new Lab(app);
const race = new Race(app, lab);

// ---------------- speed (two sliders, one value) ----------------
const sliders = [[$('#speed'), $('#speed-out')], [$('#race-speed'), $('#race-speed-out')]];
function setSpeed(v) {
  app.speed = +v;
  for (const [input, out] of sliders) {
    input.value = v;
    input.style.setProperty('--p', `${((v - input.min) / (input.max - input.min)) * 100}%`);
    out.textContent = speedLabel(+v);
  }
}
for (const [input] of sliders) input.addEventListener('input', (e) => setSpeed(e.target.value));
setSpeed(app.speed);

// ---------------- modes ----------------
const tabs = $('.mode-tabs');
const ink = $('.mode-ink');
function placeInk() {
  const active = tabs.querySelector('.mode-tab.active');
  ink.style.width = `${active.offsetWidth}px`;
  ink.style.transform = `translateX(${active.offsetLeft - 4}px)`;
}

function setMode(mode) {
  if (mode === app.mode) return;
  app.mode = mode;
  tabs.dataset.mode = mode;
  for (const t of tabs.querySelectorAll('.mode-tab')) {
    const on = t.dataset.mode === mode;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  }
  placeInk();
  $('#explore-view').hidden = mode !== 'explore';
  $('#race-view').hidden = mode !== 'race';
  if (mode === 'race') { lab.pauseIfRunning(); race.enter(); }
  else race.leave();
}

tabs.addEventListener('click', (e) => {
  const t = e.target.closest('[data-mode]');
  if (t) setMode(t.dataset.mode);
});
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-goto]');
  if (link) setMode(link.dataset.goto);
});
window.addEventListener('resize', placeInk);
placeInk();

// ---------------- learn section ----------------
renderLearn($('#algo-cards'), $('#compare-table'), (id) => {
  setMode('explore');
  lab.selectAlgorithm(id);
  $('#lab').scrollIntoView({ behavior: 'smooth' });
});

// ---------------- landing ----------------
startHero($('#hero-canvas'));

// Seed the board with a maze so first-time visitors have something to solve.
lab.generateInstant('backtracker');
lab.setStatus('idle', 'A maze is ready. Pick an algorithm and press Visualize, or draw your own walls.');

// ---------------- scroll reveals ----------------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 80}ms`;
  io.observe(el);
});
