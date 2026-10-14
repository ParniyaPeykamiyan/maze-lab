// algorithms.js: pathfinding algorithms as generator functions.
//
// Each algorithm takes a graph (see gridGraph in grid.js) and yields steps:
//   { type: 'visit', id, frontier: [ids], msg }   one cell expanded
//   { type: 'done', found, path, length, cost, explored, msg }
// Yielding lets the UI animate, pause, single-step and narrate the search, and
// lets race mode advance several algorithms in lockstep. Pass
// { narrate: false } to skip building the plain-English messages (used when
// timing a run or recomputing instantly).

class MinHeap {
  constructor() { this.a = []; this.seq = 0; }
  get size() { return this.a.length; }
  push(id, p) {
    const a = this.a;
    a.push({ id, p, s: this.seq++ });
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (!less(a[i], a[j])) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
const less = (x, y) => x.p < y.p || (x.p === y.p && x.s < y.s);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function finish(g, prev, found, explored, narrate) {
  const path = [];
  if (found) {
    for (let v = g.end; v !== -1; v = prev[v]) path.push(v);
    path.reverse();
  }
  let cost = 0;
  for (let i = 1; i < path.length; i++) cost += g.cost(path[i]);
  const length = Math.max(0, path.length - 1);
  let msg = '';
  if (narrate) {
    msg = found
      ? `Goal reached! The path is ${plural(length, 'step')} long${cost !== length ? ` and costs ${cost}, because mud counts extra` : ''}. It took ${plural(explored, 'explored cell')} to find it.`
      : `No path exists. All ${explored} reachable cells were explored and the goal was never found, so it must be walled off.`;
  }
  return { type: 'done', found, path, length, cost, explored, msg };
}

// ---------------------------------------------------------------------------

export function* dijkstra(g, { narrate = true } = {}) {
  const N = g.size;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  dist[g.start] = 0;
  heap.push(g.start, 0);
  let explored = 0;

  while (heap.size) {
    const u = heap.pop().id;
    if (closed[u]) continue;
    closed[u] = 1;
    explored++;
    if (u === g.end) {
      yield { type: 'visit', id: u, frontier: [], msg: narrate && `${g.label(u)} is the goal, and it came off the queue with total cost ${dist[u]}. Every other route still waiting costs at least this much, so this one is guaranteed cheapest.` };
      yield finish(g, prev, true, explored, narrate);
      return;
    }
    const frontier = [];
    for (const v of g.neighbors(u)) {
      if (closed[v]) continue;
      const nd = dist[u] + g.cost(v);
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(v, nd);
        frontier.push(v);
      }
    }
    let msg = '';
    if (narrate) {
      msg = u === g.start
        ? `Starting at ${g.label(u)} with cost 0. Dijkstra always expands whichever known cell is cheapest to reach. ${plural(frontier.length, 'neighbour')} added to the queue.`
        : `${g.label(u)} is the cheapest unexplored cell (total cost ${dist[u]}${g.isMud(u) ? ', including mud' : ''}). ` +
          (frontier.length ? `Found cheaper routes to ${plural(frontier.length, 'neighbour')}.` : 'No neighbour got a cheaper route through here.');
    }
    yield { type: 'visit', id: u, frontier, msg };
  }
  yield finish(g, prev, false, explored, narrate);
}

export function* astar(g, { narrate = true } = {}) {
  const N = g.size;
  const gs = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  // Tie-break equal f scores toward the cell closer to the goal.
  const prio = (v) => gs[v] + g.heuristic(v) + g.heuristic(v) * 1e-3;
  gs[g.start] = 0;
  heap.push(g.start, prio(g.start));
  let explored = 0;

  while (heap.size) {
    const u = heap.pop().id;
    if (closed[u]) continue;
    closed[u] = 1;
    explored++;
    const h = g.heuristic(u);
    if (u === g.end) {
      yield { type: 'visit', id: u, frontier: [], msg: narrate && `Reached the goal ${g.label(u)} with cost g = ${gs[u]}. Because h never overestimates, no unexplored route can beat it.` };
      yield finish(g, prev, true, explored, narrate);
      return;
    }
    const frontier = [];
    for (const v of g.neighbors(u)) {
      if (closed[v]) continue;
      const ng = gs[u] + g.cost(v);
      if (ng < gs[v]) {
        gs[v] = ng;
        prev[v] = u;
        heap.push(v, prio(v));
        frontier.push(v);
      }
    }
    let msg = '';
    if (narrate) {
      msg = u === g.start
        ? `Starting at ${g.label(u)}. A* scores every cell as f = g + h: g is the cost so far, h is a guess of the distance left (here ${h}). It always explores the lowest f next.`
        : `${g.label(u)} has the lowest score: f = g ${gs[u]} + h ${h} = ${gs[u] + h}. ` +
          (frontier.length ? `Scored ${plural(frontier.length, 'neighbour')}.` : 'Nothing new to score from here.');
    }
    yield { type: 'visit', id: u, frontier, msg };
  }
  yield finish(g, prev, false, explored, narrate);
}

export function* greedy(g, { narrate = true } = {}) {
  const N = g.size;
  const prev = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const heap = new MinHeap();
  heap.push(g.start, g.heuristic(g.start));
  seen[g.start] = 1;
  let explored = 0;

  while (heap.size) {
    const u = heap.pop().id;
    explored++;
    const h = g.heuristic(u);
    if (u === g.end) {
      yield { type: 'visit', id: u, frontier: [], msg: narrate && `Made it to the goal ${g.label(u)}! Greedy is often quick, but it never checked whether a shorter route existed.` };
      yield finish(g, prev, true, explored, narrate);
      return;
    }
    const frontier = [];
    for (const v of g.neighbors(u)) {
      if (seen[v]) continue;
      seen[v] = 1;
      prev[v] = u;
      heap.push(v, g.heuristic(v));
      frontier.push(v);
    }
    let msg = '';
    if (narrate) {
      msg = u === g.start
        ? `Starting at ${g.label(u)}, ${plural(h, 'step')} from the goal as the crow flies. Greedy always jumps to whichever cell looks closest to the goal and ignores how far it has already walked.`
        : `${g.label(u)} looks closest to the goal (about ${plural(h, 'step')} away). ` +
          (frontier.length ? `Added ${plural(frontier.length, 'neighbour')}.` : 'Dead end, so it falls back to the next most promising cell.');
    }
    yield { type: 'visit', id: u, frontier, msg };
  }
  yield finish(g, prev, false, explored, narrate);
}

export function* bfs(g, { narrate = true } = {}) {
  const N = g.size;
  const prev = new Int32Array(N).fill(-1);
  const depth = new Int32Array(N);
  const seen = new Uint8Array(N);
  const queue = [g.start];
  seen[g.start] = 1;
  let head = 0;
  let explored = 0;
  let ring = 0;

  while (head < queue.length) {
    const u = queue[head++];
    explored++;
    if (u === g.end) {
      yield { type: 'visit', id: u, frontier: [], msg: narrate && `Found the goal ${g.label(u)} in ring ${depth[u]}. BFS checks every ring before moving outward, so no route with fewer steps can exist.` };
      yield finish(g, prev, true, explored, narrate);
      return;
    }
    const frontier = [];
    for (const v of g.neighbors(u)) {
      if (seen[v]) continue;
      seen[v] = 1;
      prev[v] = u;
      depth[v] = depth[u] + 1;
      queue.push(v);
      frontier.push(v);
    }
    let msg = '';
    if (narrate) {
      let prefix = '';
      if (depth[u] > ring) { ring = depth[u]; prefix = `Ring ${ring - 1} is finished, moving one step further out. `; }
      msg = u === g.start
        ? `Starting at ${g.label(u)}. BFS explores in rings, like ripples in a pond: every cell 1 step away, then every cell 2 steps away, and so on. ${plural(frontier.length, 'neighbour')} joined the queue.`
        : `${prefix}${g.label(u)} is ${plural(depth[u], 'step')} from the start. ` +
          (frontier.length ? `Queued ${plural(frontier.length, 'new neighbour')} for ring ${depth[u] + 1}.` : 'No unseen neighbours here.');
    }
    yield { type: 'visit', id: u, frontier, msg };
  }
  yield finish(g, prev, false, explored, narrate);
}

export function* dfs(g, { narrate = true } = {}) {
  const N = g.size;
  const prev = new Int32Array(N).fill(-1);
  const depth = new Int32Array(N);
  const seen = new Uint8Array(N);
  const stack = [g.start];
  let explored = 0;
  let last = -1;

  while (stack.length) {
    const u = stack.pop();
    if (seen[u]) continue;
    seen[u] = 1;
    explored++;
    const backtracked = last !== -1 && prev[u] !== last;
    last = u;
    if (u === g.end) {
      yield { type: 'visit', id: u, frontier: [], msg: narrate && `Stumbled onto the goal ${g.label(u)} at depth ${depth[u]}. DFS stops at the first route it finds, which is rarely the shortest.` };
      yield finish(g, prev, true, explored, narrate);
      return;
    }
    const frontier = [];
    const nbrs = g.neighbors(u);
    // Push in reverse so the first neighbour (up) is explored first.
    for (let i = nbrs.length - 1; i >= 0; i--) {
      const v = nbrs[i];
      if (seen[v]) continue;
      prev[v] = u;
      depth[v] = depth[u] + 1;
      stack.push(v);
      frontier.push(v);
    }
    let msg = '';
    if (narrate) {
      if (u === g.start) msg = `Starting at ${g.label(u)}. DFS picks one direction and keeps going as deep as it can, only backing up when it hits a dead end.`;
      else if (backtracked) msg = `Dead end! Backtracking to ${g.label(prev[u])} and trying the unexplored branch at ${g.label(u)}.`;
      else msg = `Diving deeper into ${g.label(u)} (depth ${depth[u]}). ` + (frontier.length ? `${plural(frontier.length, 'option')} saved on the stack for later.` : 'Nowhere left to go from here.');
    }
    yield { type: 'visit', id: u, frontier, msg };
  }
  yield finish(g, prev, false, explored, narrate);
}

// ---------------------------------------------------------------------------

export const ALGORITHMS = [
  { id: 'astar', name: 'A* Search', short: 'A*', color: '#22e4ff', weighted: true, optimal: true, run: astar },
  { id: 'dijkstra', name: "Dijkstra's Algorithm", short: 'Dijkstra', color: '#a78bfa', weighted: true, optimal: true, run: dijkstra },
  { id: 'bfs', name: 'Breadth-First Search', short: 'BFS', color: '#34d399', weighted: false, optimal: true, run: bfs },
  { id: 'dfs', name: 'Depth-First Search', short: 'DFS', color: '#ff3ec8', weighted: false, optimal: false, run: dfs },
  { id: 'greedy', name: 'Greedy Best-First', short: 'Greedy', color: '#ffb627', weighted: false, optimal: false, run: greedy },
];

export const getAlgorithm = (id) => ALGORITHMS.find((a) => a.id === id);

/**
 * Run an algorithm to completion without animation. Returns { result, visited, ms }.
 * Timing is the best of a few runs, so the first run's JIT warm-up doesn't skew it.
 */
export function solve(meta, graph) {
  let visited, result;
  let ms = Infinity;
  const budgetEnd = performance.now() + 30;
  for (let run = 0; run < 5 && (run === 0 || performance.now() < budgetEnd); run++) {
    visited = [];
    const t0 = performance.now();
    for (const s of meta.run(graph, { narrate: false })) {
      if (s.type === 'visit') visited.push(s.id);
      else result = s;
    }
    ms = Math.min(ms, performance.now() - t0);
  }
  return { result, visited, ms };
}
