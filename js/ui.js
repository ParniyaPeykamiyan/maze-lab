// ui.js: the 1P Explore screen: fighter roster, board controller, level
// select, stats HUD, hint box and pop-up messages.

import { Grid } from './grid.js';
import { ALGORITHMS, getAlgorithm, solve } from './algorithms.js';
import { MAZES, getMaze } from './mazes.js';
import { Animator } from './animator.js';
import { HintBox, INFO, renderFighterCard } from './explain.js';
import { spriteEl, sheetURL } from './sprites.js';
import { sfx } from './sound.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, ms = 3600) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 300);
}

// Browsers round performance.now() (often to 0.1ms), so tiny runs read as "<0.1ms".
export const formatMs = (ms) => (ms < 0.1 ? '<0.1ms' : `${ms.toFixed(ms < 10 ? 2 : 1)}ms`);

/** Paint a board with a fighter's sprite on the start tile and its trail colour. */
export function dressGrid(grid, algoId) {
  const meta = getAlgorithm(algoId);
  grid.el.style.setProperty('--hero', `url(${sheetURL(algoId)})`);
  grid.el.style.setProperty('--visited', meta.visited);
  grid.el.style.setProperty('--accent', meta.color);
}

export const levelLabel = (m) => (m.level ? `LEVEL ${m.level}` : m.name.toUpperCase());

/** Grid dimensions per size preset; odd numbers so carved mazes fit exactly. */
function sizePreset(key) {
  const narrow = window.matchMedia('(max-width: 760px)').matches;
  const presets = narrow
    ? { S: [17, 13], M: [23, 17], L: [31, 21] }
    : { S: [15, 31], M: [21, 45], L: [29, 61] };
  const [rows, cols] = presets[key];
  return { rows, cols };
}

const STATUS_TEXT = {
  idle: 'READY. Draw walls or pick a level.',
  generating: 'Building the level…',
};

export class Lab {
  constructor(app) {
    this.app = app;
    this.root = $('#game');
    this.grid = new Grid($('#grid'), sizePreset($('#size').value));
    this.hint = new HintBox($('#explain'));
    this.anim = new Animator(() => app.rate);
    this.algo = 'astar';
    this.status = 'idle';
    this.lastRun = null; // algorithm id of the last completed run (for live recompute)
    this.level = 'CUSTOM';
    this.token = 0;

    this.buildPickers();
    this.bindControls();
    this.selectAlgorithm(this.algo, { quiet: true });
    this.grid.onEdit = (type) => this.onEdit(type);
  }

  // ---------------- setup ----------------

  buildPickers() {
    const roster = $('#algo-picker');
    for (const a of ALGORITHMS) {
      const b = document.createElement('button');
      b.className = 'fighter';
      b.dataset.algo = a.id;
      b.setAttribute('role', 'radio');
      b.style.setProperty('--c', a.color);
      b.append(spriteEl(a.id, 'sprite-md'));
      b.insertAdjacentHTML('beforeend', `<span class="fighter-name">${INFO[a.id].hero}</span><span class="fighter-algo">${a.short}</span>`);
      roster.append(b);
    }
    roster.addEventListener('click', (e) => {
      const b = e.target.closest('[data-algo]');
      if (b) { sfx.select(); this.selectAlgorithm(b.dataset.algo); }
    });

    const levels = $('#maze-picker');
    levels.innerHTML = MAZES.map((m) => m.level
      ? `<button class="btn btn-level" data-maze="${m.id}" title="${m.full}"><b>LEVEL ${m.level}</b><small>${m.name}</small></button>`
      : `<button class="btn btn-level btn-slime" data-maze="${m.id}" title="Add pools of slime"><b>+ SLIME</b><small>pools</small></button>`).join('');
    levels.addEventListener('click', (e) => {
      const b = e.target.closest('[data-maze]');
      if (b) this.generate(b.dataset.maze);
    });

    const tools = $('#tool-picker');
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      sfx.click();
      this.grid.tool = b.dataset.tool;
      this.markActive(tools, 'tool', b.dataset.tool);
    });
  }

  markActive(container, key, value) {
    for (const b of container.querySelectorAll(`[data-${key}]`)) {
      const on = b.dataset[key] === value;
      b.classList.toggle('active', on);
      if (b.hasAttribute('role')) b.setAttribute('aria-checked', on);
    }
  }

  bindControls() {
    $('#btn-run').addEventListener('click', () => this.runOrToggle());
    $('#btn-step').addEventListener('click', () => this.step());
    $('#btn-clear-path').addEventListener('click', () => { sfx.click(); this.clearPath(); });
    $('#btn-clear-board').addEventListener('click', () => { sfx.click(); this.clearBoard(); });
    $('#btn-explain').addEventListener('click', () => { sfx.click(); this.toggleExplain(); });
    $('#explain-close').addEventListener('click', () => this.toggleExplain(false));
    $('#size').addEventListener('change', (e) => {
      this.stopAll();
      this.grid.build(...Object.values(sizePreset(e.target.value)));
      this.level = 'CUSTOM';
      this.setStatus('idle');
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea, button') || this.app.screen !== 'game') return;
      if (e.code === 'Space') { e.preventDefault(); this.runOrToggle(); }
    });
  }

  // ---------------- state ----------------

  setStatus(status, text) {
    this.status = status;
    this.root.dataset.status = status;
    const locked = status === 'running' || status === 'paused' || status === 'generating';
    this.grid.locked = locked;
    this.grid.el.classList.toggle('locked', locked);
    $('#run-label').textContent = status === 'running' ? 'PAUSE' : status === 'paused' ? 'RESUME' : 'START';
    $('#status-text').textContent = text || STATUS_TEXT[status] || '';
  }

  stopAll() {
    this.token++;
    this.anim.stop();
    this.grid.setCurrent(-1);
    this.grid.locked = false;
  }

  setStats({ explored = '---', length = '---', cost = '---', time = '---' } = {}) {
    const set = (id, v) => {
      const el = $(id);
      const s = String(v);
      if (el.textContent === s) return;
      el.textContent = s;
      if (s !== '---') { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    };
    set('#stat-explored', explored);
    set('#stat-length', length);
    set('#stat-cost', cost);
    set('#stat-time', time);
  }

  resultStats(res, explored, ms) {
    return {
      explored,
      length: res.found ? res.length : 'NONE',
      cost: res.found ? res.cost : 'NONE',
      time: formatMs(ms),
    };
  }

  resultText(meta, res) {
    const hero = INFO[meta.id].hero;
    if (!res.found) return `NO PATH! ${hero} searched everywhere. The goal is walled off.`;
    const note = meta.optimal ? (meta.weighted ? 'guaranteed cheapest' : 'fewest steps') : 'not necessarily the shortest';
    return `GOAL! ${hero} found a path: ${res.length} steps, cost ${res.cost} (${note}). Drag the start, goal or walls to see it update.`;
  }

  // ---------------- actions ----------------

  selectAlgorithm(id, { quiet = false } = {}) {
    this.algo = id;
    this.markActive($('#algo-picker'), 'algo', id);
    renderFighterCard($('#fighter-card'), id);
    dressGrid(this.grid, id);
    this.hint.setAlgorithm(id);
    if (this.status === 'done' || this.status === 'nopath') {
      this.lastRun = id;
      this.instant();
    } else if (!quiet && this.status === 'idle') {
      $('#status-text').textContent = `${INFO[id].hero} is ready. Press START.`;
    }
  }

  runOrToggle() {
    sfx.click();
    if (this.status === 'running') { this.anim.pause(); this.setStatus('paused', 'PAUSED. Press RESUME, or STEP to go one move at a time.'); return; }
    if (this.status === 'paused') { this.anim.resume(); this.setStatus('running', this.runningText()); return; }
    if (this.status === 'generating') return;
    this.run();
  }

  step() {
    if (this.status === 'generating') return;
    sfx.click();
    if (this.status === 'running' || this.status === 'paused') {
      this.anim.step();
      if (this.status === 'running') this.setStatus('paused', 'STEP MODE. Press STEP again or RESUME.');
      return;
    }
    this.run({ paused: true });
    this.anim.step();
  }

  runningText() { return `${INFO[this.algo].hero} is exploring…`; }

  async run({ paused = false } = {}) {
    this.stopAll();
    const token = this.token;
    const meta = getAlgorithm(this.algo);
    const grid = this.grid;
    grid.clearVisuals();
    grid.setInstant(false);
    const graph = grid.toGraph();

    // Time a silent run separately so the animation doesn't inflate the number.
    const { ms } = solve(meta, graph);
    if (!meta.weighted && grid.hasMud()) toast(`HEADS UP: ${INFO[meta.id].hero} ignores slime and treats every tile as cost 1.`);

    this.hint.reset(`${INFO[meta.id].hero} enters the maze. Watch the board, or read along here.`);
    this.setStats({ explored: 0 });
    this.setStatus(paused ? 'paused' : 'running', paused ? 'STEP MODE. Press STEP again or RESUME.' : this.runningText());

    let explored = 0;
    let result = null;
    const pathStagger = Math.max(15, 60 - this.app.speed * 0.45);
    const ok = await this.anim.run(meta.run(graph, { narrate: true }), {
      paused,
      onStep: (s) => {
        if (s.type === 'visit') {
          explored++;
          grid.markVisited(s.id);
          grid.setCurrent(s.id);
          for (const f of s.frontier) grid.markFrontier(f);
          this.hint.push(s.msg);
          sfx.explore(explored);
        } else {
          result = s;
          grid.setCurrent(-1);
          grid.markPath(s.path, pathStagger);
          this.hint.push(s.msg, 'done');
          if (s.found) sfx.found(); else sfx.fail();
        }
      },
      onFrame: () => { if (token === this.token) this.setStats({ explored }); },
    });
    if (!ok || token !== this.token) return;

    this.lastRun = this.algo;
    this.setStats(this.resultStats(result, explored, ms));
    this.setStatus(result.found ? 'done' : 'nopath', this.resultText(meta, result));
  }

  /** Recompute and redraw the last run with no animation (after an edit). */
  instant() {
    const meta = getAlgorithm(this.lastRun);
    const grid = this.grid;
    grid.clearVisuals();
    grid.setInstant(true);
    const { result, visited, ms } = solve(meta, grid.toGraph());
    for (const id of visited) grid.markVisited(id);
    grid.markPath(result.path);
    this.setStats(this.resultStats(result, visited.length, ms));
    this.setStatus(result.found ? 'done' : 'nopath', this.resultText(meta, result));
  }

  onEdit(type) {
    if (type === 'paint') this.level = 'CUSTOM';
    if ((this.status === 'done' || this.status === 'nopath') && this.lastRun) this.instant();
  }

  clearPath() {
    this.stopAll();
    this.grid.clearVisuals();
    this.lastRun = null;
    this.setStats();
    this.hint.reset();
    this.setStatus('idle');
  }

  clearBoard() {
    this.clearPath();
    this.grid.clearTerrain();
    this.level = 'CUSTOM';
  }

  applyMazeOp(op) {
    const g = this.grid;
    switch (op.op) {
      case 'fill': g.fillWalls(); break;
      case 'clear': g.clearTerrain(); break;
      case 'open': for (const id of op.ids) g.setWall(id, false); break;
      case 'wall': for (const id of op.ids) g.setWall(id, true); break;
      case 'mud': for (const id of op.ids) g.setMud(id, true); break;
    }
    if (op.head !== undefined) g.setCurrent(op.head);
  }

  mazeInput() {
    const g = this.grid;
    return { rows: g.rows, cols: g.cols, start: g.start, end: g.end, walls: g.walls };
  }

  async generate(id) {
    if (this.status === 'generating') return;
    const maze = getMaze(id);
    this.stopAll();
    const token = this.token;
    this.grid.clearVisuals();
    this.grid.setInstant(false);
    this.lastRun = null;
    this.setStats();
    if (maze.carves) this.grid.snapEndpoints();
    if (maze.level) this.level = levelLabel(maze);
    this.markActive($('#maze-picker'), 'maze', id);
    this.setStatus('generating', maze.level ? `LOADING ${levelLabel(maze)}: ${maze.full}…` : 'Pouring slime…');
    this.hint.reset(maze.id === 'mud'
      ? 'Slime! Stepping into a slime tile costs 5 instead of 1. Only Dijkstra and Astra are smart enough to go around it.'
      : `${levelLabel(maze)}: ${maze.full}. Watch the maze carve itself.`);

    const ok = await this.anim.run(maze.run(this.mazeInput()), {
      rateScale: 4,
      onStep: (op) => { this.applyMazeOp(op); sfx.carve(); },
    });
    if (token !== this.token) return;
    this.grid.setCurrent(-1);
    this.markActive($('#maze-picker'), 'maze', null);
    this.setStatus('idle', ok ? `${maze.level ? levelLabel(maze) : 'SLIME'} READY. Press START.` : undefined);
  }

  /** Generate without animation (used on load and by the VS screen's level buttons). */
  generateInstant(id) {
    const maze = getMaze(id);
    this.stopAll();
    this.grid.clearVisuals();
    this.lastRun = null;
    this.setStats();
    if (maze.carves) this.grid.snapEndpoints();
    if (maze.level) this.level = levelLabel(maze);
    for (const op of maze.run(this.mazeInput())) this.applyMazeOp(op);
    this.grid.setCurrent(-1);
    this.setStatus('idle', `${maze.level ? levelLabel(maze) : 'SLIME'} READY. Press START.`);
  }

  toggleExplain(force) {
    const box = $('#explain');
    const on = force ?? box.hidden;
    box.hidden = !on;
    $('#btn-explain').setAttribute('aria-pressed', on);
    if (on) this.hint.setAlgorithm(this.algo);
    if (on && this.app.speed > 45 && this.status !== 'running') toast('TIP: Lower the speed to read along.');
  }

  /** Called when leaving the Explore screen. */
  pauseIfRunning() {
    if (this.status === 'running') { this.anim.pause(); this.setStatus('paused', 'PAUSED.'); }
  }
}
