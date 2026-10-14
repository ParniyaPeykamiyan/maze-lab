// race.js: run 2–4 algorithms side by side on identical copies of the maze.
//
// All racers advance in lockstep (one expansion each per tick), so "time on
// screen" is a fair proxy for how much work each algorithm does.

import { Grid } from './grid.js';
import { ALGORITHMS, getAlgorithm, solve } from './algorithms.js';
import { MAZES } from './mazes.js';
import { Animator } from './animator.js';
import { INFO } from './explain.js';
import { $, toast, formatMs } from './ui.js';

const TROPHY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.35 12H8a4 4 0 0 1-4-4V5h3V3Zm10 4v3a2 2 0 0 0 1-1.73V7h-1ZM6 7v1.27A2 2 0 0 0 7 10V7H6Z"/></svg>`;
const CROWN = `<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7Z"/></svg>`;

/** Advance every unfinished racer by one step per tick. */
function* lockstep(racers, apply) {
  while (racers.some((r) => !r.done)) {
    for (const r of racers) {
      if (r.done) continue;
      const s = r.iter.next();
      if (s.done) r.done = true;
      else apply(r, s.value);
    }
    yield;
  }
}

const fmtTime = (ms) => `${(ms / 1000).toFixed(2)}s`;

export class Race {
  constructor(app, lab) {
    this.app = app;
    this.lab = lab;
    this.selected = ['astar', 'dijkstra', 'greedy', 'dfs'];
    this.anim = new Animator(() => app.rate);
    this.racers = [];
    this.state = 'idle'; // idle | running | paused | finished
    this.token = 0;

    this.buildControls();
  }

  buildControls() {
    const chips = $('#race-chips');
    chips.innerHTML = ALGORITHMS.map((a) =>
      `<button class="chip" data-algo="${a.id}" style="--c:${a.color}" aria-pressed="false"><span class="dot"></span>${a.short}</button>`).join('');
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-algo]');
      if (b) this.toggleRacer(b.dataset.algo);
    });
    this.syncChips();

    const mazes = $('#race-maze');
    mazes.innerHTML = MAZES.map((m) => `<button data-maze="${m.id}" title="${m.full}">${m.id === 'mud' ? '+ Mud' : m.name}</button>`).join('');
    mazes.addEventListener('click', (e) => {
      const b = e.target.closest('[data-maze]');
      if (!b) return;
      this.lab.generateInstant(b.dataset.maze);
      this.prepare();
    });

    $('#race-start').addEventListener('click', () => this.startOrToggle());
    $('#race-reset').addEventListener('click', () => this.prepare());
    $('#race-banner').addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      if (a.dataset.action === 'again') this.start();
      else this.hideBanner();
    });
  }

  toggleRacer(id) {
    const i = this.selected.indexOf(id);
    if (i >= 0) {
      if (this.selected.length <= 2) { toast('A race needs at least 2 algorithms.'); return; }
      this.selected.splice(i, 1);
    } else {
      if (this.selected.length >= 4) { toast('Up to 4 racers at once. Remove one first.'); return; }
      this.selected.push(id);
    }
    // keep a stable order matching the chip order
    this.selected.sort((a, b) => ALGORITHMS.findIndex((x) => x.id === a) - ALGORITHMS.findIndex((x) => x.id === b));
    this.syncChips();
    this.prepare();
  }

  syncChips() {
    for (const b of $('#race-chips').children) {
      const on = this.selected.includes(b.dataset.algo);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    }
  }

  setState(state) {
    this.state = state;
    $('#race-label').textContent = state === 'running' ? 'Pause' : state === 'paused' ? 'Resume' : state === 'finished' ? 'Race again' : 'Start race';
  }

  /** Build one panel + board per racer, each loaded with a copy of the lab maze. */
  prepare() {
    this.token++;
    this.anim.stop();
    this.hideBanner();
    const snap = this.lab.grid.snapshot();
    const panels = $('#race-panels');
    panels.replaceChildren();

    this.racers = this.selected.map((id, i) => {
      const meta = getAlgorithm(id);
      const panel = document.createElement('div');
      panel.className = 'race-panel';
      panel.style.setProperty('--accent', meta.color);
      panel.style.animationDelay = `${i * 60}ms`;
      panel.innerHTML = `<header><h4><span class="dot"></span>${meta.name}${CROWN}</h4><span class="pill">ready</span></header><div class="race-grid"></div>`;
      panels.append(panel);
      const grid = new Grid(panel.querySelector('.race-grid'), { rows: snap.rows, cols: snap.cols, interactive: false });
      grid.load(snap);
      return { meta, panel, grid, pill: panel.querySelector('.pill'), explored: 0, done: false, result: null, time: 0 };
    });
    this.renderBoard();
    this.setState('idle');
  }

  startOrToggle() {
    if (this.state === 'running') { this.anim.pause(); this.setState('paused'); this.setPills('paused'); return; }
    if (this.state === 'paused') { this.anim.resume(); this.setState('running'); this.setPills('racing…'); return; }
    this.start();
  }

  setPills(text) {
    for (const r of this.racers) if (!r.result) r.pill.textContent = text;
  }

  async start() {
    this.prepare();
    const token = this.token;
    for (const r of this.racers) {
      const graph = r.grid.toGraph();
      r.cpu = solve(r.meta, graph).ms;
      r.iter = r.meta.run(graph, { narrate: false });
      r.pill.className = 'pill running';
      r.pill.textContent = 'racing…';
    }
    if (this.lab.grid.hasMud() && this.racers.some((r) => !r.meta.weighted)) {
      toast('There is mud on this maze. Only Dijkstra and A* will route around it.');
    }
    this.setState('running');
    const stagger = Math.max(5, 30 - this.app.speed * 0.25);

    const ok = await this.anim.run(lockstep(this.racers, (r, s) => {
      if (s.type === 'visit') {
        r.explored++;
        r.grid.markVisited(s.id);
        r.grid.setCurrent(s.id);
        for (const f of s.frontier) r.grid.markFrontier(f);
      } else {
        r.result = s;
        r.done = true;
        r.time = this.anim.elapsed;
        r.grid.setCurrent(-1);
        r.grid.markPath(s.path, stagger);
        r.panel.classList.add('finished');
        r.pill.className = s.found ? 'pill done' : 'pill fail';
        r.pill.textContent = s.found ? `done in ${fmtTime(r.time)}` : 'no path';
      }
    }), {
      onStep: () => {},
      onFrame: () => { if (token === this.token) this.renderBoard(); },
    });
    if (!ok || token !== this.token) return;
    this.finish();
  }

  ranked() {
    const score = (r) => (r.result && r.result.found ? r.result.cost : Infinity);
    return [...this.racers].sort((a, b) => score(a) - score(b) || a.explored - b.explored);
  }

  renderBoard() {
    const finished = this.state === 'finished';
    const list = finished ? this.ranked() : this.racers;
    const leader = finished ? list[0] : null;
    $('#race-board').innerHTML = list.map((r, i) => {
      const res = r.result;
      const time = res ? r.time : this.anim.running ? this.anim.elapsed : 0;
      const path = res ? (res.found ? res.length : '✕') : '–';
      const cost = res ? (res.found ? res.cost : '✕') : '–';
      const lead = leader === r && res && res.found;
      return `<tr class="${lead ? 'lead' : ''}" style="--c:${r.meta.color}">
        <td>${finished ? i + 1 : '·'}</td>
        <td class="name"><span class="dot"></span>${r.meta.short}</td>
        <td>${r.explored}</td>
        <td>${path}</td>
        <td>${cost}</td>
        <td>${fmtTime(time)}${finished && r.cpu != null ? `<span class="sub">cpu ${formatMs(r.cpu)}</span>` : ''}</td>
      </tr>`;
    }).join('');
  }

  finish() {
    this.setState('finished');
    this.renderBoard();
    const ranked = this.ranked();
    const winner = ranked[0];
    const banner = $('#race-banner');

    if (!winner.result.found) {
      banner.innerHTML = `<div class="banner-card" style="--accent: var(--rose)">
        <p class="kicker">Race over</p>
        <h3>Nobody made it</h3>
        <p>The goal is unreachable on this maze. Go back to Explore, clear a few walls and try again.</p>
        <div class="banner-actions"><button class="btn btn-ghost" data-action="close">Close</button></div>
      </div>`;
      banner.hidden = false;
      return;
    }

    const runnerUp = ranked[1];
    const tie = runnerUp && runnerUp.result.found && runnerUp.result.cost === winner.result.cost && runnerUp.explored === winner.explored;
    const finishers = this.racers.filter((r) => r.result.found);
    const fastest = finishers.reduce((a, b) => (b.time < a.time ? b : a));
    winner.panel.classList.add('winner');
    if (tie) runnerUp.panel.classList.add('winner');

    const lines = [];
    lines.push(`Found the cheapest route (<b>cost ${winner.result.cost}</b>, ${winner.result.length} steps) after exploring <b>${winner.explored}</b> cells.`);
    if (fastest !== winner && fastest.result.cost > winner.result.cost) {
      lines.push(`${fastest.meta.short} crossed the line first, but its path cost ${fastest.result.cost}. That's ${fastest.result.cost - winner.result.cost} more.`);
    }
    const title = tie
      ? `It's a tie: <span>${winner.meta.short}</span> &amp; <span style="--accent:${runnerUp.meta.color}">${runnerUp.meta.short}</span>`
      : `<span>${winner.meta.short}</span> wins!`;

    banner.innerHTML = `<div class="banner-card" style="--accent:${winner.meta.color}">
      <div class="confetti">${this.confetti()}</div>
      <div class="trophy">${TROPHY}</div>
      <p class="kicker">Race results</p>
      <h3>${title}</h3>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      <p class="why">${INFO[winner.meta.id].insight}</p>
      <div class="banner-actions">
        <button class="btn btn-primary" data-action="again">Race again</button>
        <button class="btn btn-ghost" data-action="close">See the boards</button>
      </div>
    </div>`;
    banner.hidden = false;
  }

  confetti() {
    const colors = ['#22e4ff', '#ff3ec8', '#ffb627', '#a78bfa', '#34d399'];
    let html = '';
    for (let i = 0; i < 36; i++) {
      html += `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.6}s;animation-duration:${1.6 + Math.random() * 1.4}s"></i>`;
    }
    return html;
  }

  hideBanner() {
    $('#race-banner').hidden = true;
  }

  enter() { if (this.state !== 'running' && this.state !== 'paused') this.prepare(); }

  leave() {
    if (this.state === 'running') { this.anim.pause(); this.setState('paused'); this.setPills('paused'); }
  }
}
