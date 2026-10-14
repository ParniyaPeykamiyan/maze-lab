// ui.js: the Explore-mode lab: toolbar, board controller, stats, toasts.

import { Grid } from './grid.js';
import { ALGORITHMS, getAlgorithm, solve } from './algorithms.js';
import { MAZES, getMaze } from './mazes.js';
import { Animator } from './animator.js';
import { ExplainPanel } from './explain.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, ms = 3600) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 350);
}

export const formatMs = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(2)} ms`);

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
  idle: 'Ready. Draw some walls or generate a maze.',
  generating: 'Building the maze…',
};

export class Lab {
  constructor(app) {
    this.app = app;
    this.root = $('#lab');
    this.grid = new Grid($('#grid'), sizePreset($('#size').value));
    this.explain = new ExplainPanel($('#explain'));
    this.anim = new Animator(() => app.rate);
    this.algo = 'astar';
    this.status = 'idle';
    this.lastRun = null; // algorithm id of the last completed run (for live recompute)
    this.token = 0;

    this.buildPickers();
    this.bindControls();
    this.explain.setAlgorithm(this.algo);
    this.grid.onEdit = () => this.onEdit();
  }

  // ---------------- setup ----------------

  buildPickers() {
    const algoPicker = $('#algo-picker');
    algoPicker.innerHTML = ALGORITHMS.map((a) =>
      `<button role="radio" data-algo="${a.id}" style="--c:${a.color}" title="${a.name}"><span class="dot"></span>${a.short}</button>`).join('');
    algoPicker.addEventListener('click', (e) => {
      const b = e.target.closest('[data-algo]');
      if (b) this.selectAlgorithm(b.dataset.algo);
    });
    this.markActive(algoPicker, 'algo', this.algo);

    const mazePicker = $('#maze-picker');
    mazePicker.innerHTML = MAZES.map((m) => `<button data-maze="${m.id}" title="${m.full}">${m.name}</button>`).join('');
    mazePicker.addEventListener('click', (e) => {
      const b = e.target.closest('[data-maze]');
      if (b) this.generate(b.dataset.maze);
    });

    const toolPicker = $('#tool-picker');
    toolPicker.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      this.grid.tool = b.dataset.tool;
      this.markActive(toolPicker, 'tool', b.dataset.tool);
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
    $('#btn-clear-path').addEventListener('click', () => this.clearPath());
    $('#btn-clear-board').addEventListener('click', () => this.clearBoard());
    $('#btn-explain').addEventListener('click', () => this.toggleExplain());
    $('#explain-close').addEventListener('click', () => this.toggleExplain(false));
    $('#size').addEventListener('change', (e) => {
      this.stopAll();
      this.grid.build(...Object.values(sizePreset(e.target.value)));
      this.setStatus('idle');
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, select, textarea, button') || this.app.mode !== 'explore') return;
      if (e.code === 'Space' && this.inView()) { e.preventDefault(); this.runOrToggle(); }
    });
  }

  inView() {
    const r = this.root.getBoundingClientRect();
    return r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.4;
  }

  // ---------------- state ----------------

  setStatus(status, text) {
    this.status = status;
    this.root.dataset.status = status;
    const locked = status === 'running' || status === 'paused' || status === 'generating';
    this.grid.locked = locked;
    this.grid.el.classList.toggle('locked', locked);
    $('#run-label').textContent = status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Visualize';
    $('#status-text').textContent = text || STATUS_TEXT[status] || '';
  }

  stopAll() {
    this.token++;
    this.anim.stop();
    this.grid.setCurrent(-1);
    this.grid.locked = false;
  }

  setStats({ explored = '–', length = '–', cost = '–', time = '–' } = {}) {
    const set = (id, v) => {
      const el = $(id);
      const s = String(v);
      if (el.textContent === s) return;
      el.textContent = s;
      if (s !== '–') { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    };
    set('#stat-explored', explored);
    set('#stat-length', length);
    set('#stat-cost', cost);
    set('#stat-time', time);
  }

  resultStats(res, explored, ms) {
    return {
      explored,
      length: res.found ? res.length : 'none',
      cost: res.found ? res.cost : 'none',
      time: formatMs(ms),
    };
  }

  resultText(meta, res) {
    if (!res.found) return `${meta.short} explored every reachable cell. The goal is walled off.`;
    const note = meta.optimal ? (meta.weighted ? 'guaranteed cheapest' : 'fewest steps') : 'not necessarily the shortest';
    return `${meta.short} found a path: ${res.length} steps, cost ${res.cost} (${note}). Drag the start, goal or walls to watch it update live.`;
  }

  // ---------------- actions ----------------

  selectAlgorithm(id) {
    this.algo = id;
    this.markActive($('#algo-picker'), 'algo', id);
    this.explain.setAlgorithm(id);
    if (this.status === 'done' || this.status === 'nopath') {
      this.lastRun = id;
      this.instant();
    }
  }

  runOrToggle() {
    if (this.status === 'running') { this.anim.pause(); this.setStatus('paused', 'Paused. Press Resume, or Step to go one move at a time.'); return; }
    if (this.status === 'paused') { this.anim.resume(); this.setStatus('running', this.runningText()); return; }
    if (this.status === 'generating') return;
    this.run();
  }

  step() {
    if (this.status === 'generating') return;
    if (this.status === 'running' || this.status === 'paused') {
      this.anim.step();
      if (this.status === 'running') this.setStatus('paused', 'Stepping. Press Step again or Resume.');
      return;
    }
    this.run({ paused: true });
    this.anim.step();
  }

  runningText() { return `${getAlgorithm(this.algo).name} is exploring…`; }

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
    if (!meta.weighted && grid.hasMud()) toast(`Heads up: ${meta.short} ignores mud. It treats every cell as costing 1.`);

    this.explain.reset(`Running ${meta.name}. Watch the board, or read along here.`);
    this.setStats({ explored: 0 });
    this.setStatus(paused ? 'paused' : 'running', paused ? 'Stepping. Press Step again or Resume.' : this.runningText());

    let explored = 0;
    let result = null;
    const pathStagger = Math.max(6, 42 - this.app.speed * 0.34);
    const ok = await this.anim.run(meta.run(graph, { narrate: true }), {
      paused,
      onStep: (s) => {
        if (s.type === 'visit') {
          explored++;
          grid.markVisited(s.id);
          grid.setCurrent(s.id);
          for (const f of s.frontier) grid.markFrontier(f);
          this.explain.push(s.msg);
        } else {
          result = s;
          grid.setCurrent(-1);
          grid.markPath(s.path, pathStagger);
          this.explain.push(s.msg, 'done');
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

  onEdit() {
    if ((this.status === 'done' || this.status === 'nopath') && this.lastRun) this.instant();
  }

  clearPath() {
    this.stopAll();
    this.grid.clearVisuals();
    this.lastRun = null;
    this.setStats();
    this.explain.reset();
    this.setStatus('idle');
  }

  clearBoard() {
    this.clearPath();
    this.grid.clearTerrain();
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
    this.markActive($('#maze-picker'), 'maze', id);
    this.setStatus('generating', `Generating: ${maze.full}…`);
    this.explain.reset(maze.id === 'mud'
      ? 'Sprinkling mud. Stepping into a mud cell costs 5 instead of 1. Only Dijkstra and A* take that into account.'
      : `Generating a maze with ${maze.full}.`);

    const ok = await this.anim.run(maze.run(this.mazeInput()), {
      rateScale: 4,
      onStep: (op) => this.applyMazeOp(op),
    });
    if (token !== this.token) return;
    this.grid.setCurrent(-1);
    this.markActive($('#maze-picker'), 'maze', null);
    this.setStatus('idle', ok ? `${maze.full} is ready. Pick an algorithm and press Visualize.` : undefined);
  }

  /** Generate without animation (used by race mode's quick-maze buttons). */
  generateInstant(id) {
    const maze = getMaze(id);
    this.stopAll();
    this.grid.clearVisuals();
    this.lastRun = null;
    this.setStats();
    if (maze.carves) this.grid.snapEndpoints();
    for (const op of maze.run(this.mazeInput())) this.applyMazeOp(op);
    this.grid.setCurrent(-1);
    this.setStatus('idle', `${maze.full} is ready.`);
  }

  toggleExplain(force) {
    const ws = $('#workspace');
    const on = force ?? !ws.classList.contains('with-explain');
    ws.classList.toggle('with-explain', on);
    $('#btn-explain').setAttribute('aria-pressed', on);
    if (on && this.app.speed > 45 && this.status !== 'running') {
      toast('Tip: lower the speed to read along comfortably.');
    }
  }

  /** Called when leaving Explore mode. */
  pauseIfRunning() {
    if (this.status === 'running') { this.anim.pause(); this.setStatus('paused', 'Paused.'); }
  }
}
