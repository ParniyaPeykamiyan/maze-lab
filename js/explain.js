// explain.js: plain-English descriptions of each algorithm, the live
// narration panel, and the "Meet the racers" cards and comparison table.

import { ALGORITHMS, getAlgorithm } from './algorithms.js';

export const INFO = {
  astar: {
    tagline: 'The smart navigator: cost so far plus an educated guess.',
    analogy: 'Like a hiker who can see the mountain peak. They take the trail that has been cheapest so far and also points toward the summit.',
    how: [
      'Give every cell a score f = g + h. Here g is the real cost to reach it and h is a guess of the distance left (Manhattan distance).',
      'Always explore the cell with the lowest f next.',
      'The guess never overestimates, so the first time A* reaches the goal it has the cheapest route.',
    ],
    time: 'O(E log V)',
    timeNote: 'worst case, same as Dijkstra, but usually far fewer cells',
    space: 'O(V)',
    shortest: 'yes',
    weights: 'yes',
    insight: 'A* used its distance guess to skip cells that could not possibly be on a cheaper route.',
  },
  dijkstra: {
    tagline: 'The careful accountant: always expands the cheapest cell.',
    analogy: 'Like water spreading out from a spring. It reaches nearby places first and flows more slowly through mud.',
    how: [
      'Keep a priority queue of cells, ordered by the total cost to reach them.',
      'Take the cheapest cell, then check whether going through it gives any neighbour a cheaper route.',
      'Repeat until the goal comes off the queue. Its cost is then final and guaranteed minimal.',
    ],
    time: 'O((V + E) log V)',
    timeNote: 'with a binary-heap priority queue',
    space: 'O(V)',
    shortest: 'yes',
    weights: 'yes',
    insight: 'Dijkstra never guesses, so it explores evenly in every direction. That is thorough, but it checks a lot of cells.',
  },
  bfs: {
    tagline: 'Ripples in a pond: explores ring by ring.',
    analogy: 'Like a rumour spreading. First everyone 1 handshake away hears it, then everyone 2 handshakes away, and so on.',
    how: [
      'Put the start in a first-in, first-out queue.',
      'Take the oldest cell and add all its unseen neighbours to the back of the queue.',
      'Cells are reached in order of step count, so the first path found has the fewest steps.',
    ],
    time: 'O(V + E)',
    timeNote: 'every cell and connection is handled at most once',
    space: 'O(V)',
    shortest: 'steps',
    weights: 'no',
    insight: 'BFS finds the route with the fewest steps. It treats mud like normal ground, though.',
  },
  dfs: {
    tagline: 'The reckless explorer: dives deep, backtracks at dead ends.',
    analogy: 'Like exploring a cave by always taking the first tunnel you see, and only turning back when you hit a wall.',
    how: [
      'Push the start onto a last-in, first-out stack.',
      'Pop the newest cell, mark it explored, and push its unseen neighbours.',
      'It keeps following one branch as deep as it goes. The first route it finds is often long and winding.',
    ],
    time: 'O(V + E)',
    timeNote: 'every cell and connection is handled at most once',
    space: 'O(V)',
    shortest: 'no',
    weights: 'no',
    insight: 'DFS commits to one direction at a time. Sometimes it gets lucky, but its paths are rarely short.',
  },
  greedy: {
    tagline: 'The impatient optimist: always heads for what looks closest.',
    analogy: 'Like walking toward a tower you can see over the rooftops. It is fast in open space, but easy to lead into a dead-end alley.',
    how: [
      'Score each cell only by its estimated distance to the goal (h). Ignore the distance already travelled.',
      'Always explore the cell that looks closest to the goal.',
      'It usually explores very few cells, but it can be fooled into long detours.',
    ],
    time: 'O(E log V)',
    timeNote: 'worst case; often much faster in practice',
    space: 'O(V)',
    shortest: 'no',
    weights: 'no',
    insight: 'Greedy beelined toward the goal. That is very efficient when the way is clear.',
  },
};

const SHORTEST = {
  yes: ['yes', 'Shortest path guaranteed'],
  steps: ['mid', 'Fewest steps (ignores mud)'],
  no: ['no', 'No shortest-path guarantee'],
};
const WEIGHTS = {
  yes: ['yes', 'Respects mud'],
  no: ['no', 'Ignores mud'],
};

function badges(info) {
  const [sc, st] = SHORTEST[info.shortest];
  const [wc, wt] = WEIGHTS[info.weights];
  const icon = (c) => (c === 'yes' ? '✓' : c === 'no' ? '✕' : '≈');
  return `<div class="badges"><span class="badge ${sc}">${icon(sc)} ${st}</span><span class="badge ${wc}">${icon(wc)} ${wt}</span></div>`;
}

export class ExplainPanel {
  constructor(root) {
    this.root = root;
    this.card = root.querySelector('#explain-card');
    this.log = root.querySelector('#explain-log');
    this.countEl = root.querySelector('#explain-count');
    this.queue = [];
    this.dropped = 0;
    this.count = 0;
    this.raf = 0;
  }

  setAlgorithm(id) {
    const meta = getAlgorithm(id);
    const info = INFO[id];
    this.card.style.setProperty('--c', meta.color);
    this.card.innerHTML = `
      <h3><span class="dot"></span>${meta.name}</h3>
      <p class="tagline">${info.tagline}</p>
      ${badges(info)}
      <p class="analogy">${info.analogy}</p>
      <ol>${info.how.map((s) => `<li>${s}</li>`).join('')}</ol>
      <dl class="complexity">
        <dt>Time</dt><dd>${info.time}</dd>
        <dt>Memory</dt><dd>${info.space}</dd>
      </dl>`;
    // restart the entrance animation
    this.card.style.animation = 'none';
    void this.card.offsetWidth;
    this.card.style.animation = '';
  }

  reset(msg) {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
    this.dropped = 0;
    this.count = 0;
    this.log.replaceChildren();
    this.countEl.textContent = 'waiting';
    if (msg) this.push(msg, 'info', false);
  }

  /** Queue a message; rendering is batched to one DOM update per frame. */
  push(msg, kind = 'step', counted = true) {
    if (!msg) return;
    if (counted) this.count++;
    this.queue.push({ msg, kind, n: counted ? this.count : 0 });
    if (this.queue.length > 30) { this.queue.shift(); this.dropped++; }
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }

  flush() {
    this.raf = 0;
    const frag = document.createDocumentFragment();
    if (this.dropped) {
      const li = document.createElement('li');
      li.className = 'skip';
      li.textContent = `…${this.dropped} steps flew by. Lower the speed to read every one.`;
      frag.prepend(li);
      this.dropped = 0;
    }
    for (const item of this.queue) {
      const li = document.createElement('li');
      li.className = item.kind === 'done' ? 'done' : item.kind === 'info' ? 'info' : '';
      if (item.n) {
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = item.kind === 'done' ? 'RESULT' : `STEP ${item.n}`;
        li.append(n);
      }
      li.append(item.msg);
      frag.prepend(li);
    }
    this.queue = [];
    this.log.prepend(frag);
    while (this.log.children.length > 60) this.log.lastElementChild.remove();
    this.log.scrollTop = 0;
    this.countEl.textContent = this.count ? `${this.count} steps` : 'waiting';
  }
}

/** Render the algorithm cards and comparison table in the "Learn" section. */
export function renderLearn(cardsEl, tableEl, onTry) {
  cardsEl.innerHTML = ALGORITHMS.map((a) => {
    const info = INFO[a.id];
    return `
      <article class="algo-card reveal" style="--c:${a.color}">
        <h3>${a.name}<small>${info.time}</small></h3>
        <p>${info.tagline}</p>
        <p>${info.analogy}</p>
        ${badges(info)}
        <button class="try" data-try="${a.id}">Try ${a.short} in the lab →</button>
      </article>`;
  }).join('');
  cardsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-try]');
    if (b) onTry(b.dataset.try);
  });

  const cell = (map, key) => {
    const [c, t] = map[key];
    return `<td class="${c}">${t}</td>`;
  };
  tableEl.innerHTML = `
    <thead><tr><th>Algorithm</th><th>Strategy</th><th>Shortest path?</th><th>Uses weights?</th><th>Time complexity</th></tr></thead>
    <tbody>${ALGORITHMS.map((a) => {
      const info = INFO[a.id];
      return `<tr style="--c:${a.color}">
        <td class="name"><span class="dot"></span>${a.name}</td>
        <td>${info.tagline.split(':')[0]}</td>
        ${cell({ yes: ['yes', 'Yes'], steps: ['mid', 'Fewest steps only'], no: ['no', 'No'] }, info.shortest)}
        ${cell({ yes: ['yes', 'Yes'], no: ['no', 'No'] }, info.weights)}
        <td class="mono">${info.time}</td>
      </tr>`;
    }).join('')}</tbody>`;
}
