// race.js: the VS battle: 2–4 fighters race on identical copies of the maze.
//
// All racers advance in lockstep (one expansion each per tick), so "time on
// screen" is a fair proxy for how much work each algorithm does.

import { Grid } from './grid.js';
import { ALGORITHMS, getAlgorithm, solve } from './algorithms.js';
import { MAZES } from './mazes.js';
import { Animator } from './animator.js';
import { INFO } from './explain.js';
import { spriteEl } from './sprites.js';
import { sfx } from './sound.js';
import { qualifies, saveScore, initialsPicker } from './scores.js';
import { $, toast, formatMs, dressGrid } from './ui.js';

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Winner's score: path efficiency (path tiles ÷ tiles explored, so 1.0 means
 * it explored nothing but the path) x 10000, plus 1000 per rival in the race.
 */
export const raceScore = (r, racers) =>
  Math.round((10000 * (r.result.length + 1)) / r.explored) + 1000 * (racers - 1);

export class Race {
  constructor(app, lab) {
    this.app = app;
    this.lab = lab;
    this.selected = ['astar', 'dijkstra', 'dfs', 'greedy'];
    this.anim = new Animator(() => app.rate);
    this.racers = [];
    this.state = 'idle'; // idle | countdown | running | paused | finished
    this.token = 0;
    this.buildControls();
  }

  buildControls() {
    const roster = $('#race-chips');
    for (const a of ALGORITHMS) {
      const b = document.createElement('button');
      b.className = 'fighter fighter-vs';
      b.dataset.algo = a.id;
      b.style.setProperty('--c', a.color);
      b.setAttribute('aria-pressed', 'false');
      b.append(spriteEl(a.id, 'sprite-md'));
      b.insertAdjacentHTML('beforeend', `<span class="fighter-name">${INFO[a.id].hero}</span><span class="fighter-algo">${a.short}</span><span class="ptag"></span>`);
      roster.append(b);
    }
    roster.addEventListener('click', (e) => {
      const b = e.target.closest('[data-algo]');
      if (b) this.toggleRacer(b.dataset.algo);
    });
    this.syncChips();

    const levels = $('#race-maze');
    levels.innerHTML = MAZES.map((m) => `<button class="btn btn-sm" data-maze="${m.id}" title="${m.full}">${m.level ? `LV${m.level}` : '+SLIME'}</button>`).join('');
    levels.addEventListener('click', (e) => {
      const b = e.target.closest('[data-maze]');
      if (!b || this.state === 'countdown') return;
      sfx.carve();
      this.lab.generateInstant(b.dataset.maze);
      this.prepare();
    });

    $('#race-start').addEventListener('click', () => this.startOrToggle());
    $('#race-reset').addEventListener('click', () => { sfx.click(); this.prepare(); });
    $('#race-banner').addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      sfx.click();
      if (a.dataset.action === 'again') this.start();
      else if (a.dataset.action === 'scores') this.app.go('scores');
      else this.hideBanner();
    });
  }

  toggleRacer(id) {
    if (this.state === 'countdown') return;
    const i = this.selected.indexOf(id);
    if (i >= 0) {
      if (this.selected.length <= 2) { toast('A battle needs at least 2 fighters.'); return; }
      this.selected.splice(i, 1);
    } else {
      if (this.selected.length >= 4) { toast('Max 4 fighters. Remove one first.'); return; }
      this.selected.push(id);
    }
    sfx.select();
    // keep a stable order matching the roster
    this.selected.sort((a, b) => ALGORITHMS.findIndex((x) => x.id === a) - ALGORITHMS.findIndex((x) => x.id === b));
    this.syncChips();
    this.prepare();
  }

  syncChips() {
    for (const b of $('#race-chips').children) {
      const idx = this.selected.indexOf(b.dataset.algo);
      b.classList.toggle('on', idx >= 0);
      b.setAttribute('aria-pressed', idx >= 0);
      b.querySelector('.ptag').textContent = idx >= 0 ? `P${idx + 1}` : '';
    }
  }

  setState(state) {
    this.state = state;
    $('#race-label').textContent = { running: 'PAUSE', paused: 'RESUME', finished: 'REMATCH', countdown: 'READY…' }[state] || 'FIGHT!';
    $('#race-start').disabled = state === 'countdown';
  }

  /** Build one panel + board per racer, each loaded with a copy of the lab maze. */
  prepare() {
    this.token++;
    this.anim.stop();
    this.hideBanner();
    $('#race-countdown').hidden = true;
    const snap = this.lab.grid.snapshot();
    const panels = $('#race-panels');
    panels.replaceChildren();
    panels.dataset.count = this.selected.length;

    this.racers = this.selected.map((id, i) => {
      const meta = getAlgorithm(id);
      const panel = document.createElement('div');
      panel.className = 'race-panel';
      panel.style.setProperty('--c', meta.color);
      panel.innerHTML = `<header><span class="ptag">P${i + 1}</span><span class="pname">${INFO[id].hero}</span><span class="pill">READY</span></header><div class="crt-screen"><div class="race-grid"></div></div>`;
      panel.querySelector('header').prepend(spriteEl(id, 'sprite-sm'));
      panels.append(panel);
      const grid = new Grid(panel.querySelector('.race-grid'), { rows: snap.rows, cols: snap.cols, interactive: false });
      grid.load(snap);
      dressGrid(grid, id);
      return { meta, player: i + 1, panel, grid, pill: panel.querySelector('.pill'), explored: 0, done: false, result: null, time: 0 };
    });
    this.renderBoard();
    this.setState('idle');
  }

  startOrToggle() {
    sfx.click();
    if (this.state === 'running') { this.anim.pause(); this.setState('paused'); this.setPills('PAUSED'); return; }
    if (this.state === 'paused') { this.anim.resume(); this.setState('running'); this.setPills('GO!'); return; }
    if (this.state === 'countdown') return;
    this.start();
  }

  setPills(text) {
    for (const r of this.racers) if (!r.result) r.pill.textContent = text;
  }

  async countdown(token) {
    const el = $('#race-countdown');
    el.hidden = false;
    for (const n of ['3', '2', '1', 'GO!']) {
      if (token !== this.token) return false;
      el.innerHTML = `<span class="count ${n === 'GO!' ? 'go' : ''}">${n}</span>`;
      if (n === 'GO!') sfx.go(); else sfx.count();
      await wait(n === 'GO!' ? 500 : 650);
    }
    el.hidden = true;
    return token === this.token;
  }

  async start() {
    this.prepare();
    const token = this.token;
    this.setState('countdown');
    for (const r of this.racers) {
      const graph = r.grid.toGraph();
      r.cpu = solve(r.meta, graph).ms;
      r.iter = r.meta.run(graph, { narrate: false });
    }
    if (!(await this.countdown(token))) return;

    if (this.lab.grid.hasMud() && this.racers.some((r) => !r.meta.weighted)) {
      toast('Slime on the course! Only Dijkstra and Astra will go around it.');
    }
    for (const r of this.racers) { r.pill.className = 'pill running'; r.pill.textContent = 'GO!'; }
    this.setState('running');
    const stagger = Math.max(12, 40 - this.app.speed * 0.3);
    let ticks = 0;

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
        r.pill.textContent = s.found ? `GOAL ${fmtTime(r.time)}` : 'NO PATH';
        sfx.finish();
      }
    }), {
      onStep: () => sfx.explore(++ticks),
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
    $('#race-board').innerHTML = list.map((r, i) => {
      const res = r.result;
      const time = res ? r.time : this.anim.running ? this.anim.elapsed : 0;
      const path = res ? (res.found ? res.length : 'X') : '-';
      const cost = res ? (res.found ? res.cost : 'X') : '-';
      const lead = finished && i === 0 && res && res.found;
      return `<tr class="${lead ? 'lead' : ''}" style="--c:${r.meta.color}">
        <td>${finished ? i + 1 : '-'}</td>
        <td class="name">P${r.player} ${INFO[r.meta.id].hero}</td>
        <td>${r.explored}</td>
        <td>${path}</td>
        <td>${cost}</td>
        <td>${fmtTime(time)}${finished && r.cpu != null ? `<span class="sub">CPU ${formatMs(r.cpu)}</span>` : ''}</td>
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
      sfx.fail();
      banner.innerHTML = `<div class="winner-card" style="--c:#FF004D">
        <h3 class="win-big">GAME OVER</h3>
        <p>Nobody reached the goal. It's walled off. Go back to 1P EXPLORE, clear a few walls and try again.</p>
        <div class="btn-row"><button class="btn" data-action="close">CONTINUE</button></div>
      </div>`;
      this.showBanner();
      return;
    }

    sfx.win();
    const runnerUp = ranked[1];
    const tie = runnerUp && runnerUp.result.found && runnerUp.result.cost === winner.result.cost && runnerUp.explored === winner.explored;
    const finishers = this.racers.filter((r) => r.result.found);
    const fastest = finishers.reduce((a, b) => (b.time < a.time ? b : a));
    winner.panel.classList.add('winner');
    if (tie) runnerUp.panel.classList.add('winner');

    const hero = INFO[winner.meta.id].hero;
    const score = raceScore(winner, this.racers.length);
    const lines = [`${hero} found the cheapest route: cost ${winner.result.cost}, ${winner.result.length} steps, exploring ${winner.explored} tiles.`];
    if (fastest !== winner && fastest.result.cost > winner.result.cost) {
      lines.push(`${INFO[fastest.meta.id].hero} reached the goal first, but paid ${fastest.result.cost - winner.result.cost} more.`);
    }
    const title = tie ? 'DRAW GAME!' : `PLAYER ${winner.player} WINS`;
    const sub = tie ? `P${winner.player} ${hero} &amp; P${runnerUp.player} ${INFO[runnerUp.meta.id].hero}` : `${hero} · ${INFO[winner.meta.id].title}`;

    banner.innerHTML = `<div class="winner-card" style="--c:${winner.meta.color}">
      <div class="winner-sprite"></div>
      <h3 class="win-big">${title}</h3>
      <p class="win-sub">${sub}</p>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      <p class="why">${INFO[winner.meta.id].insight}</p>
      <p class="win-score">SCORE <b>${String(score).padStart(6, '0')}</b></p>
      <div class="score-entry"></div>
      <div class="btn-row">
        <button class="btn btn-go" data-action="again">REMATCH</button>
        <button class="btn" data-action="scores">HI-SCORES</button>
        <button class="btn btn-dark" data-action="close">VIEW BOARDS</button>
      </div>
    </div>`;
    banner.querySelector('.winner-sprite').append(spriteEl(winner.meta.id, 'sprite-xxl'));
    this.showBanner();

    const entry = banner.querySelector('.score-entry');
    this.app.setScore(score);
    if (qualifies(score)) {
      entry.insertAdjacentHTML('beforebegin', '<p class="new-hi">NEW HIGH SCORE! ENTER YOUR INITIALS</p>');
      initialsPicker(entry, (name) => {
        const rank = saveScore({ name, score, fighter: winner.meta.id, level: this.lab.level, date: Date.now() });
        sfx.saved();
        banner.querySelector('.new-hi').textContent = rank >= 0 ? `SAVED! ${name} IS RANK #${rank + 1}` : 'SAVED!';
        entry.remove();
        this.app.refreshScores();
      });
    } else {
      entry.innerHTML = '<p class="note">Not enough for the high-score table this time.</p>';
    }
  }

  showBanner() {
    $('#race-banner').hidden = false;
    $('#race-arena').classList.add('show-result');
  }

  hideBanner() {
    $('#race-banner').hidden = true;
    $('#race-arena').classList.remove('show-result');
  }

  enter() { if (this.state !== 'running' && this.state !== 'paused' && this.state !== 'countdown') this.prepare(); }

  leave() {
    if (this.state === 'countdown') this.prepare();
    if (this.state === 'running') { this.anim.pause(); this.setState('paused'); this.setPills('PAUSED'); }
  }
}
