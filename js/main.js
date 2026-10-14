// main.js: boots the cabinet: shared app state, screen switching (attract,
// 1P explore, VS battle, hi-scores, help), the sound toggle, speed sliders
// and the score HUD.
//
// Future modes (street map, race-the-algorithm game, 3D) can be added as more
// screens alongside these.

import { Lab, $ } from './ui.js';
import { Race } from './race.js';
import { renderLearn, INFO } from './explain.js';
import { createAttract } from './attract.js';
import { speedToRate, speedLabel } from './animator.js';
import { ALGORITHMS, getAlgorithm } from './algorithms.js';
import { spriteEl, sheetURL } from './sprites.js';
import { setSound, sfx } from './sound.js';
import { loadScores, topScore, resetScores } from './scores.js';

const SCREENS = ['attract', 'game', 'vs', 'scores', 'help'];
const pad = (n) => String(n).padStart(6, '0');

const app = {
  speed: 55,
  screen: 'attract',
  get rate() { return speedToRate(this.speed); },
  go: (s) => go(s),
  setScore(n) { $('#hud-score').textContent = pad(n); },
  refreshScores: () => refreshScores(),
};

// The goal flag is the same everywhere.
document.documentElement.style.setProperty('--goal', `url(${sheetURL('goal')})`);
document.documentElement.style.setProperty('--hero-legend', `url(${sheetURL('astar')})`);

const lab = new Lab(app);
const race = new Race(app, lab);
const attract = createAttract($('#attract-canvas'));

// ---------------- screens ----------------
function go(screen, { push = true } = {}) {
  if (!SCREENS.includes(screen)) screen = 'attract';
  const prev = app.screen;
  app.screen = screen;
  for (const s of SCREENS) $(`#${s}`).hidden = s !== screen;
  $('#deck').hidden = screen === 'attract';
  for (const b of document.querySelectorAll('.deck [data-screen]')) {
    b.classList.toggle('active', b.dataset.screen === screen);
    b.setAttribute('aria-current', b.dataset.screen === screen ? 'page' : 'false');
  }
  if (screen === 'attract') attract.start(); else attract.stop();
  if (prev === 'game' && screen !== 'game') lab.pauseIfRunning();
  if (prev === 'vs' && screen !== 'vs') race.leave();
  if (screen === 'vs') race.enter();
  if (screen === 'scores') refreshScores();
  if (push) history.replaceState(null, '', screen === 'attract' ? location.pathname : `#${screen}`);
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-screen]');
  if (!link) return;
  e.preventDefault();
  if (link.dataset.screen !== app.screen) sfx.click();
  go(link.dataset.screen);
});

$('#press-start').addEventListener('click', () => { sfx.go(); go('game'); });
document.addEventListener('keydown', (e) => {
  if (app.screen === 'attract' && (e.key === 'Enter' || e.code === 'Space') && !e.target.closest?.('a, button')) {
    e.preventDefault();
    sfx.go();
    go('game');
  }
});

// ---------------- sound ----------------
const soundBtn = $('#btn-sound');
soundBtn.addEventListener('click', () => {
  const on = soundBtn.getAttribute('aria-pressed') !== 'true';
  setSound(on);
  soundBtn.setAttribute('aria-pressed', on);
  soundBtn.querySelector('span').textContent = on ? 'ON' : 'OFF';
  if (on) sfx.select();
});

// ---------------- speed (two sliders, one value) ----------------
const sliders = [[$('#speed'), $('#speed-out')], [$('#race-speed'), $('#race-speed-out')]];
function setSpeed(v) {
  app.speed = +v;
  for (const [input, out] of sliders) {
    input.value = v;
    out.textContent = speedLabel(+v).toUpperCase();
  }
}
for (const [input] of sliders) input.addEventListener('input', (e) => setSpeed(e.target.value));
setSpeed(app.speed);

// ---------------- scores ----------------
function refreshScores() {
  const list = loadScores();
  $('#hud-hi').textContent = pad(topScore());
  $('#attract-hi').textContent = pad(topScore());
  const body = $('#hiscore-body');
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const s = list[i];
    const meta = s && getAlgorithm(s.fighter);
    rows.push(s
      ? `<tr style="--c:${meta ? meta.color : '#FFF1E8'}"><td>${i + 1}${['ST', 'ND', 'RD'][i] || 'TH'}</td><td class="hs-name">${s.name}</td><td>${pad(s.score)}</td><td class="hs-fighter"></td><td>${s.level || '-'}</td></tr>`
      : `<tr class="empty"><td>${i + 1}${['ST', 'ND', 'RD'][i] || 'TH'}</td><td>---</td><td>000000</td><td>-</td><td>-</td></tr>`);
  }
  body.innerHTML = rows.join('');
  [...body.querySelectorAll('.hs-fighter')].forEach((td, i) => {
    const meta = getAlgorithm(list[i].fighter);
    if (!meta) return;
    td.append(spriteEl(meta.id, 'sprite-sm'), INFO[meta.id].hero);
  });
}
$('#btn-reset-scores').addEventListener('click', () => {
  if (!confirm('Reset the high-score table back to the default scores?')) return;
  resetScores();
  refreshScores();
});

// ---------------- title screen parade + help ----------------
const parade = $('#parade');
for (const a of ALGORITHMS) {
  const fig = document.createElement('figure');
  fig.style.setProperty('--c', a.color);
  fig.append(spriteEl(a.id, 'sprite-lg'));
  fig.insertAdjacentHTML('beforeend', `<figcaption>${INFO[a.id].hero}</figcaption>`);
  parade.append(fig);
}

renderLearn($('#algo-cards'), $('#compare-table'), (id) => {
  lab.selectAlgorithm(id);
  go('game');
});

// ---------------- boot ----------------
lab.generateInstant('backtracker');
refreshScores();
go(location.hash.slice(1) || 'attract', { push: false });
