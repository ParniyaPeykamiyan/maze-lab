// hero.js: the animated background on the landing section. It reuses the real
// maze generator and algorithms: a maze is carved instantly, then solved
// on a canvas, over and over, cycling through the algorithms.

import { backtracker } from './mazes.js';
import { gridGraph, oddCoord } from './grid.js';
import { ALGORITHMS } from './algorithms.js';

const CELL = 22;

export function startHero(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, rows = 0, cols = 0, ox = 0, oy = 0;
  let walls, iter, algoIndex = 0, visitCount = 0, path = null, pathShown = 0, holdUntil = 0;
  let visible = true, raf = 0;

  function setup() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.floor(W / CELL); if (cols % 2 === 0) cols--;
    rows = Math.floor(H / CELL); if (rows % 2 === 0) rows--;
    cols = Math.max(cols, 7); rows = Math.max(rows, 7);
    ox = (W - cols * CELL) / 2;
    oy = (H - rows * CELL) / 2;
    newMaze();
  }

  function newMaze() {
    walls = new Uint8Array(rows * cols).fill(1);
    for (const op of backtracker({ rows, cols })) {
      if (op.op === 'open') for (const id of op.ids) walls[id] = 0;
    }
    // start on the left side, goal far right (the text sits on the left)
    const start = oddCoord(rows / 2, rows) * cols + oddCoord(cols * 0.35, cols);
    const end = oddCoord(Math.random() * rows, rows) * cols + oddCoord(cols - 2, cols);
    const algo = ALGORITHMS[algoIndex++ % ALGORITHMS.length];
    iter = algo.run(gridGraph(rows, cols, walls, new Uint8Array(rows * cols).fill(1), start, end), { narrate: false });
    visitCount = 0;
    path = null;
    pathShown = 0;
    drawBase(start, end);
  }

  function rect(id, color, inset = 1) {
    const r = (id / cols) | 0, c = id - r * cols;
    ctx.fillStyle = color;
    ctx.fillRect(ox + c * CELL + inset, oy + r * CELL + inset, CELL - inset * 2, CELL - inset * 2);
  }

  function drawBase(start, end) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < walls.length; i++) {
      rect(i, walls[i] ? 'rgba(60, 75, 147, 0.32)' : 'rgba(12, 18, 38, 0.6)', walls[i] ? 1 : 0.5);
    }
    rect(start, '#22e4ff', 4);
    rect(end, '#ff3ec8', 4);
  }

  function frame(t) {
    raf = 0;
    if (!visible) return;
    if (holdUntil) {
      if (t < holdUntil) { raf = requestAnimationFrame(frame); return; }
      holdUntil = 0;
      newMaze();
    }
    if (!path) {
      for (let k = 0; k < 4; k++) {
        const s = iter.next().value;
        if (!s) break;
        if (s.type === 'visit') {
          const hue = 300 - Math.min(1, visitCount / 900) * 110;
          rect(s.id, `hsla(${hue}, 90%, 58%, 0.33)`, 2);
          visitCount++;
        } else {
          path = s.path;
          if (!path.length) holdUntil = t + 800;
          break;
        }
      }
    } else if (pathShown < path.length) {
      for (let k = 0; k < 2 && pathShown < path.length; k++) rect(path[pathShown++], 'rgba(255, 182, 39, 0.9)', 5);
      if (pathShown >= path.length) holdUntil = t + 2600;
    }
    raf = requestAnimationFrame(frame);
  }

  function play() { if (!raf && !reduced) raf = requestAnimationFrame(frame); }

  setup();
  if (reduced) {
    // Show one finished frame instead of animating.
    for (let s = iter.next(); !s.done; s = iter.next()) {
      if (s.value.type === 'visit') rect(s.value.id, 'rgba(34, 228, 255, 0.18)', 2);
      else s.value.path.forEach((id) => rect(id, 'rgba(255, 182, 39, 0.8)', 5));
    }
  }
  play();

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play();
  }).observe(canvas);

  let resizeTimer;
  let lastW = W;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (Math.abs(canvas.clientWidth - lastW) < 40) return; // ignore mobile URL-bar jiggle
      lastW = canvas.clientWidth;
      holdUntil = 0;
      setup();
    }, 200);
  });
}
