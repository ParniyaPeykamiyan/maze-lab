// grid.js: the board model, its DOM rendering, and mouse/touch editing.
//
// Algorithms never touch a Grid directly. They receive a small "graph" object
// (see gridGraph below) that only knows about node ids, neighbours, costs and a
// heuristic. A future street-map or 3D mode only has to provide another
// object with the same shape to reuse every algorithm unchanged.

export const MUD_COST = 5;

const VISUAL_CLASSES = ['visited', 'frontier', 'path', 'current'];

/** Build an algorithm-friendly graph view of a 4-connected grid. */
export function gridGraph(rows, cols, walls, weights, start, end) {
  const er = (end / cols) | 0;
  const ec = end - er * cols;
  return {
    rows,
    cols,
    size: rows * cols,
    start,
    end,
    neighbors(id) {
      const r = (id / cols) | 0;
      const c = id - r * cols;
      const out = [];
      if (r > 0 && !walls[id - cols]) out.push(id - cols);
      if (c < cols - 1 && !walls[id + 1]) out.push(id + 1);
      if (r < rows - 1 && !walls[id + cols]) out.push(id + cols);
      if (c > 0 && !walls[id - 1]) out.push(id - 1);
      return out;
    },
    /** Cost of stepping INTO a cell. */
    cost: (id) => weights[id] || 1,
    isMud: (id) => weights[id] > 1,
    /** Manhattan distance to the goal: never overestimates, since every step costs at least 1. */
    heuristic(id) {
      const r = (id / cols) | 0;
      return Math.abs(r - er) + Math.abs(id - r * cols - ec);
    },
    label(id) {
      const r = (id / cols) | 0;
      return `(${r + 1}, ${id - r * cols + 1})`;
    },
  };
}

/** Clamp to an odd coordinate in [1, max - 2], so endpoints sit on maze corridors. */
export function oddCoord(v, max) {
  let n = Math.floor(v);
  if (n % 2 === 0) n -= 1;
  return Math.max(1, Math.min(max - 2, n));
}

export class Grid {
  constructor(el, { rows = 21, cols = 45, interactive = true } = {}) {
    this.el = el;
    this.interactive = interactive;
    this.tool = 'wall';
    this.locked = false;
    this.onEdit = null;
    this.current = -1;
    this.el.classList.add('grid');
    this.build(rows, cols);
    if (interactive) this.bindPointer();
  }

  // ---------- construction ----------

  build(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    const n = rows * cols;
    this.walls = new Uint8Array(n);
    this.weights = new Uint8Array(n).fill(1);
    this.el.style.setProperty('--cols', cols);
    this.el.style.setProperty('--rows', rows);

    const frag = document.createDocumentFragment();
    this.cells = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.id = i;
      this.cells[i] = d;
      frag.appendChild(d);
    }
    this.el.replaceChildren(frag);

    this.start = -1;
    this.end = -1;
    this.current = -1;
    const r = oddCoord(rows / 2, rows);
    this.setStart(this.idx(r, oddCoord(cols * 0.2, cols)));
    this.setEnd(this.idx(r, oddCoord(cols * 0.8, cols)));
  }

  idx(r, c) { return r * this.cols + c; }
  rc(id) { const r = (id / this.cols) | 0; return [r, id - r * this.cols]; }
  get size() { return this.rows * this.cols; }

  // ---------- endpoints ----------

  setStart(id) { this.moveEndpoint('start', id); }
  setEnd(id) { this.moveEndpoint('end', id); }

  moveEndpoint(which, id) {
    const old = this[which];
    if (old >= 0) this.cells[old].classList.remove(which);
    this[which] = id;
    this.walls[id] = 0;
    this.weights[id] = 1;
    const cl = this.cells[id].classList;
    cl.remove('wall', 'mud');
    cl.add(which);
  }

  /** Move start/end onto odd coordinates so carved mazes always reach them. */
  snapEndpoints() {
    const [sr, sc] = this.rc(this.start);
    const [er, ec] = this.rc(this.end);
    let s = this.idx(oddCoord(sr, this.rows), oddCoord(sc, this.cols));
    let e = this.idx(oddCoord(er, this.rows), oddCoord(ec, this.cols));
    if (s === e) e = this.idx(oddCoord(er, this.rows), oddCoord(this.cols - 2, this.cols));
    if (s === e) s = this.idx(1, 1);
    this.setStart(s);
    this.setEnd(e);
  }

  // ---------- walls & mud ----------

  isEndpoint(id) { return id === this.start || id === this.end; }
  isMud(id) { return this.weights[id] > 1; }

  setWall(id, on) {
    if (this.isEndpoint(id) || !!this.walls[id] === on) return false;
    this.walls[id] = on ? 1 : 0;
    const cl = this.cells[id].classList;
    if (on) { this.weights[id] = 1; cl.remove('mud'); }
    cl.toggle('wall', on);
    return true;
  }

  setMud(id, on) {
    if (this.isEndpoint(id) || this.walls[id] || this.isMud(id) === on) return false;
    this.weights[id] = on ? MUD_COST : 1;
    this.cells[id].classList.toggle('mud', on);
    return true;
  }

  /** Fill every non-endpoint cell with wall (start of a carving maze). */
  fillWalls() {
    for (let i = 0; i < this.size; i++) {
      if (this.isEndpoint(i)) continue;
      this.walls[i] = 1;
      this.weights[i] = 1;
      const cl = this.cells[i].classList;
      cl.remove('mud');
      cl.add('wall');
    }
  }

  clearTerrain() {
    for (let i = 0; i < this.size; i++) {
      this.walls[i] = 0;
      this.weights[i] = 1;
      this.cells[i].classList.remove('wall', 'mud');
    }
  }

  hasMud() { return this.weights.some((w) => w > 1); }

  // ---------- search visuals ----------

  clearVisuals() {
    for (const c of this.cells) {
      c.classList.remove(...VISUAL_CLASSES);
      if (c.style.animationDelay) c.style.animationDelay = '';
    }
    this.current = -1;
  }

  setInstant(on) { this.el.classList.toggle('instant', on); }

  markVisited(id) {
    const cl = this.cells[id].classList;
    cl.remove('frontier');
    cl.add('visited');
  }

  markFrontier(id) {
    const cl = this.cells[id].classList;
    if (!cl.contains('visited')) cl.add('frontier');
  }

  setCurrent(id) {
    if (this.current >= 0) this.cells[this.current].classList.remove('current');
    this.current = id;
    if (id >= 0) this.cells[id].classList.add('current');
  }

  /** Light up a path; each cell's animation is delayed so it "draws" itself. */
  markPath(path, staggerMs = 0) {
    path.forEach((id, i) => {
      const c = this.cells[id];
      if (staggerMs) c.style.animationDelay = `${i * staggerMs}ms`;
      c.classList.add('path');
    });
  }

  // ---------- data ----------

  toGraph() {
    return gridGraph(this.rows, this.cols, this.walls.slice(), this.weights.slice(), this.start, this.end);
  }

  snapshot() {
    return {
      rows: this.rows,
      cols: this.cols,
      walls: this.walls.slice(),
      weights: this.weights.slice(),
      start: this.start,
      end: this.end,
    };
  }

  load(s) {
    if (s.rows !== this.rows || s.cols !== this.cols) this.build(s.rows, s.cols);
    this.clearVisuals();
    for (let i = 0; i < this.size; i++) {
      this.walls[i] = s.walls[i];
      this.weights[i] = s.weights[i];
      const cl = this.cells[i].classList;
      cl.toggle('wall', !!s.walls[i]);
      cl.toggle('mud', s.weights[i] > 1);
    }
    this.setStart(s.start);
    this.setEnd(s.end);
  }

  // ---------- pointer editing ----------

  bindPointer() {
    const el = this.el;
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      if (this.locked || e.button > 0) return;
      const id = this.idAt(e.clientX, e.clientY);
      if (id == null) return;
      e.preventDefault();
      const drag = { last: id };
      if (id === this.start) drag.mode = 'start';
      else if (id === this.end) drag.mode = 'end';
      else {
        drag.mode = this.tool;
        if (this.tool === 'wall') drag.value = !this.walls[id];
        else if (this.tool === 'mud') drag.value = !this.isMud(id);
      }
      this.drag = drag;
      el.classList.add(`dragging-${drag.mode}`);
      if (drag.mode !== 'start' && drag.mode !== 'end') this.paint(id);
    });

    window.addEventListener('pointermove', (e) => {
      const drag = this.drag;
      if (!drag) return;
      const id = this.idAt(e.clientX, e.clientY);
      if (id == null || id === drag.last) return;
      drag.last = id;
      if (drag.mode === 'start' || drag.mode === 'end') {
        const other = drag.mode === 'start' ? this.end : this.start;
        if (this.walls[id] || id === other) return;
        this.moveEndpoint(drag.mode, id);
        this.emit('move');
      } else {
        this.paint(id);
      }
    });

    const up = () => {
      if (!this.drag) return;
      el.classList.remove(`dragging-${this.drag.mode}`);
      this.drag = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  paint(id) {
    if (this.isEndpoint(id)) return;
    const { mode, value } = this.drag;
    let changed = false;
    if (mode === 'wall') changed = this.setWall(id, value);
    else if (mode === 'mud') {
      if (value && this.walls[id]) this.setWall(id, false);
      changed = this.setMud(id, value);
    } else {
      changed = this.setWall(id, false);
      changed = this.setMud(id, false) || changed;
    }
    if (changed) this.emit('paint');
  }

  idAt(x, y) {
    const t = document.elementFromPoint(x, y);
    if (!t || t.parentNode !== this.el) return null;
    return +t.dataset.id;
  }

  emit(type) { if (this.onEdit) this.onEdit(type); }
}
