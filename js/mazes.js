// mazes.js: maze generators as generator functions.
//
// Each generator receives { rows, cols, start, end, walls } and yields
// operations for the board to apply, one small batch at a time, so the maze
// can be animated as it forms:
//   { op: 'fill' }                   every cell becomes wall (except endpoints)
//   { op: 'clear' }                  remove all walls and mud
//   { op: 'open', ids, head }        carve passages; head = the "digger" cell
//   { op: 'wall', ids }              add walls
//   { op: 'mud', ids }               add mud
//   { op: 'done' }                   (implicit when the generator returns)
//
// Carving mazes work on odd coordinates (cells) separated by even ones (walls),
// so the board should have odd dimensions.

const rand = (n) => (Math.random() * n) | 0;
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Knock out a few walls that separate two corridors. A "perfect" maze has
 * exactly one route between any two cells; loops give algorithms real choices
 * to make, so races between them are more interesting.
 */
function* addLoops(rows, cols, walls, amount) {
  const candidates = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const id = r * cols + c;
      if (!walls[id]) continue;
      const horiz = c % 2 === 0 && r % 2 === 1 && !walls[id - 1] && !walls[id + 1];
      const vert = r % 2 === 0 && c % 2 === 1 && !walls[id - cols] && !walls[id + cols];
      if (horiz || vert) candidates.push(id);
    }
  }
  shuffle(candidates);
  for (const id of candidates.slice(0, amount)) {
    walls[id] = 0;
    yield { op: 'open', ids: [id] };
  }
}

export function* backtracker({ rows, cols }) {
  const walls = new Uint8Array(rows * cols).fill(1);
  yield { op: 'fill' };
  const id = (r, c) => r * cols + c;
  const stack = [[1, 1]];
  walls[id(1, 1)] = 0;
  yield { op: 'open', ids: [id(1, 1)], head: id(1, 1) };

  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const options = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr * 2, nc = c + dc * 2;
      if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && walls[id(nr, nc)]) {
        options.push([nr, nc, r + dr, c + dc]);
      }
    }
    if (!options.length) {
      stack.pop();
      // Show the digger backing up every few cells so the backtracking is visible.
      if (stack.length && stack.length % 3 === 0) {
        const [br, bc] = stack[stack.length - 1];
        yield { op: 'open', ids: [], head: id(br, bc) };
      }
      continue;
    }
    const [nr, nc, wr, wc] = options[rand(options.length)];
    walls[id(wr, wc)] = 0;
    walls[id(nr, nc)] = 0;
    stack.push([nr, nc]);
    yield { op: 'open', ids: [id(wr, wc), id(nr, nc)], head: id(nr, nc) };
  }
  yield* addLoops(rows, cols, walls, Math.round((rows * cols) / 70));
}

export function* prim({ rows, cols }) {
  const walls = new Uint8Array(rows * cols).fill(1);
  const listed = new Uint8Array(rows * cols);
  yield { op: 'fill' };
  const id = (r, c) => r * cols + c;
  const frontier = [];

  const addFrontier = (r, c) => {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr * 2, nc = c + dc * 2;
      if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && walls[id(nr, nc)] && !listed[id(nr, nc)]) {
        listed[id(nr, nc)] = 1;
        frontier.push([nr, nc]);
      }
    }
  };

  const sr = 1 + 2 * rand((rows - 1) >> 1);
  const sc = 1 + 2 * rand((cols - 1) >> 1);
  walls[id(sr, sc)] = 0;
  yield { op: 'open', ids: [id(sr, sc)], head: id(sr, sc) };
  addFrontier(sr, sc);

  while (frontier.length) {
    const i = rand(frontier.length);
    const [r, c] = frontier[i];
    frontier[i] = frontier[frontier.length - 1];
    frontier.pop();
    const links = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr * 2, nc = c + dc * 2;
      if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && !walls[id(nr, nc)]) links.push([r + dr, c + dc]);
    }
    if (!links.length) continue;
    const [wr, wc] = links[rand(links.length)];
    walls[id(wr, wc)] = 0;
    walls[id(r, c)] = 0;
    addFrontier(r, c);
    yield { op: 'open', ids: [id(wr, wc), id(r, c)], head: id(r, c) };
  }
  yield* addLoops(rows, cols, walls, Math.round((rows * cols) / 70));
}

export function* randomWalls({ rows, cols, start, end }, density = 0.3) {
  yield { op: 'clear' };
  const ids = [];
  for (let i = 0; i < rows * cols; i++) {
    if (i !== start && i !== end && Math.random() < density) ids.push(i);
  }
  shuffle(ids);
  for (let i = 0; i < ids.length; i += 3) yield { op: 'wall', ids: ids.slice(i, i + 3) };
}

/** Scatter organic-looking blobs of mud across open cells. */
export function* mudPatches({ rows, cols, start, end, walls }) {
  const blobs = Math.max(3, Math.round((rows * cols) / 160));
  for (let b = 0; b < blobs; b++) {
    const cr = rand(rows), cc = rand(cols);
    const radius = 1.6 + Math.random() * 2.4;
    const cells = [];
    const R = Math.ceil(radius);
    for (let r = cr - R; r <= cr + R; r++) {
      for (let c = cc - R; c <= cc + R; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        const d = Math.hypot(r - cr, c - cc) + Math.random() * 0.9;
        const i = r * cols + c;
        if (d <= radius && !walls[i] && i !== start && i !== end) cells.push([d, i]);
      }
    }
    cells.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < cells.length; i += 2) yield { op: 'mud', ids: cells.slice(i, i + 2).map((x) => x[1]) };
  }
}

// The arcade presents these as levels; 'mud' is shown as slime.
export const MAZES = [
  { id: 'random', level: 1, name: 'Random', full: 'Random walls', carves: false, run: randomWalls },
  { id: 'backtracker', level: 2, name: 'Backtracker', full: 'Recursive backtracking', carves: true, run: backtracker },
  { id: 'prim', level: 3, name: "Prim's", full: "Randomised Prim's", carves: true, run: prim },
  { id: 'mud', name: 'Slime', full: 'Slime pools', carves: false, run: mudPatches },
];

export const getMaze = (id) => MAZES.find((m) => m.id === id);
