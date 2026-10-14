// attract.js: the attract-mode demo behind the title screen. A maze carves
// itself (using the real generator), a fighter searches it (using the real
// algorithm), then walks the path collecting coins. Then the next fighter is up.
//
// The canvas is drawn at 12 pixels per tile and scaled up with
// image-rendering: pixelated, so everything stays chunky.

import { backtracker } from './mazes.js';
import { gridGraph, oddCoord } from './grid.js';
import { ALGORITHMS } from './algorithms.js';
import { PALETTE, drawSprite } from './sprites.js';

const T = 12; // canvas pixels per tile
const P = PALETTE;

export function createAttract(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rows, cols, walls, start, end, algo, iter, phase, path, walkIdx, holdUntil, frameNo = 0;
  let algoIndex = 0, running = false, raf = 0;

  function size() {
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 500;
    cols = Math.max(9, Math.floor(w / 28)) | 1;
    rows = Math.max(9, Math.floor(h / 28)) | 1;
    canvas.width = cols * T;
    canvas.height = rows * T;
  }

  function tile(id, color) {
    const r = (id / cols) | 0, c = id - r * cols;
    ctx.fillStyle = color;
    ctx.fillRect(c * T, r * T, T, T);
  }

  function wallTile(id) {
    const r = (id / cols) | 0, c = id - r * cols;
    const x = c * T, y = r * T;
    ctx.fillStyle = P[13]; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = P[6]; ctx.fillRect(x, y, T, 1); ctx.fillRect(x, y, 1, T);
    ctx.fillStyle = P[1]; ctx.fillRect(x, y + T - 2, T, 2); ctx.fillRect(x + T - 2, y, 2, T);
  }

  function coin(id) {
    const r = (id / cols) | 0, c = id - r * cols;
    ctx.fillStyle = P[9]; ctx.fillRect(c * T + 3, r * T + 3, 6, 6);
    ctx.fillStyle = P[10]; ctx.fillRect(c * T + 4, r * T + 3, 4, 6); ctx.fillRect(c * T + 3, r * T + 4, 6, 4);
    ctx.fillStyle = P[7]; ctx.fillRect(c * T + 4, r * T + 4, 1, 2);
  }

  function sprite(id, who, frame) {
    const r = (id / cols) | 0, c = id - r * cols;
    drawSprite(ctx, who, frame, c * T + 1, r * T);
  }

  function newRound() {
    size();
    walls = new Uint8Array(rows * cols).fill(1);
    for (const op of backtracker({ rows, cols })) {
      if (op.op === 'open') for (const id of op.ids) walls[id] = 0;
    }
    start = oddCoord(rows / 2, rows) * cols + 1;
    end = oddCoord(Math.random() * rows, rows) * cols + (cols - 2);
    algo = ALGORITHMS[algoIndex++ % ALGORITHMS.length];
    iter = algo.run(gridGraph(rows, cols, walls, new Uint8Array(rows * cols).fill(1), start, end), { narrate: false });
    phase = 'search';
    path = null;
    walkIdx = 0;
    holdUntil = 0;
    ctx.fillStyle = P[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < walls.length; i++) if (walls[i]) wallTile(i);
    sprite(start, algo.id, 0);
    sprite(end, 'goal', 0);
  }

  function frame(t) {
    raf = 0;
    if (!running) return;
    frameNo++;
    if (phase === 'search') {
      for (let k = 0; k < 3; k++) {
        const s = iter.next().value;
        if (!s) break;
        if (s.type === 'visit') {
          if (s.id !== start && s.id !== end) tile(s.id, algo.visited);
        } else {
          path = s.path;
          if (!path.length) { phase = 'hold'; holdUntil = t + 900; break; }
          for (let i = 1; i < path.length - 1; i++) coin(path[i]);
          phase = 'walk';
          break;
        }
      }
      if (frameNo % 12 === 0) { tile(end, P[0]); sprite(end, 'goal', (frameNo / 12) & 1); }
    } else if (phase === 'walk') {
      if (frameNo % 5 === 0) {
        const prev = path[walkIdx];
        tile(prev, prev === start ? P[0] : algo.visited);
        walkIdx++;
        if (walkIdx >= path.length - 1) { phase = 'hold'; holdUntil = t + 1600; }
        tile(path[walkIdx], walkIdx === path.length - 1 ? P[0] : algo.visited);
        sprite(path[walkIdx], algo.id, walkIdx & 1);
      }
    } else if (t >= holdUntil) {
      newRound();
    }
    raf = requestAnimationFrame(frame);
  }

  newRound();
  if (reduced) {
    // One finished frame instead of an animation.
    for (let s = iter.next(); !s.done; s = iter.next()) {
      if (s.value.type === 'visit' && s.value.id !== start && s.value.id !== end) tile(s.value.id, algo.visited);
      if (s.value.type === 'done') s.value.path.slice(1, -1).forEach(coin);
    }
  }

  return {
    start() { if (!running && !reduced) { running = true; raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); raf = 0; },
  };
}
