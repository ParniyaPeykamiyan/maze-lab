// explain.js: each algorithm's fighter persona and plain-English summary,
// the RPG-style HINT box (typewriter narration), the fighter stat card, and
// the fighter bios + move list on the help screen.

import { ALGORITHMS, getAlgorithm } from './algorithms.js';
import { spriteEl, setSprite } from './sprites.js';
import { sfx } from './sound.js';

export const INFO = {
  astar: {
    hero: 'ASTRA',
    title: 'The Clever One',
    quote: 'I always know roughly where the goal is. Why waste a single step?',
    stats: { haste: 4, brains: 5, caution: 4 },
    tagline: 'Cost so far plus an educated guess.',
    analogy: 'Like a hiker who can see the peak. She takes the trail that has been cheapest so far and also points toward the summit.',
    how: [
      'Score every tile f = g + h. Here g is the real cost to reach it and h is a guess of the distance left.',
      'Always explore the tile with the lowest f next.',
      'The guess never overestimates, so the first time A* reaches the goal it has the cheapest route.',
    ],
    time: 'O(E log V)',
    space: 'O(V)',
    shortest: 'yes',
    weights: 'yes',
    insight: 'Astra used her distance guess to skip tiles that could not possibly be on a cheaper route.',
  },
  dijkstra: {
    hero: 'DIJKSTRA',
    title: 'The Careful Explorer',
    quote: 'I check every cheap step before any expensive one. Slow, but never wrong.',
    stats: { haste: 2, brains: 3, caution: 5 },
    tagline: 'Always expands the cheapest tile.',
    analogy: 'Like water spreading out from a spring. It reaches nearby places first and oozes slowly through slime.',
    how: [
      'Keep a queue of tiles, ordered by the total cost to reach them.',
      'Take the cheapest tile, then check whether going through it gives any neighbour a cheaper route.',
      'Repeat until the goal comes off the queue. Its cost is then final and guaranteed minimal.',
    ],
    time: 'O((V+E) log V)',
    space: 'O(V)',
    shortest: 'yes',
    weights: 'yes',
    insight: 'Dijkstra never guesses, so he explores evenly in every direction. Thorough, but he checks a lot of tiles.',
  },
  bfs: {
    hero: 'RIPPLE',
    title: 'The Patient Frog',
    quote: 'One hop at a time, in every direction. I never skip a ring.',
    stats: { haste: 2, brains: 2, caution: 4 },
    tagline: 'Explores ring by ring, like ripples in a pond.',
    analogy: 'Like a rumour spreading. First everyone 1 handshake away hears it, then everyone 2 handshakes away, and so on.',
    how: [
      'Put the start in a first-in, first-out queue.',
      'Take the oldest tile and add all its unseen neighbours to the back of the queue.',
      'Tiles are reached in order of step count, so the first path found has the fewest steps.',
    ],
    time: 'O(V+E)',
    space: 'O(V)',
    shortest: 'steps',
    weights: 'no',
    insight: 'Ripple finds the route with the fewest hops. He hops straight through slime, though.',
  },
  dfs: {
    hero: 'DASH',
    title: 'The Reckless Runner',
    quote: 'Pick a tunnel and GO! Dead end? Run back and try the next one!',
    stats: { haste: 5, brains: 1, caution: 1 },
    tagline: 'Dives deep, backtracks at dead ends.',
    analogy: 'Like exploring a cave by always taking the first tunnel you see, and only turning back when you hit a wall.',
    how: [
      'Push the start onto a last-in, first-out stack.',
      'Pop the newest tile, mark it explored, and push its unseen neighbours.',
      'Dash keeps following one branch as deep as it goes. The first route found is often long and winding.',
    ],
    time: 'O(V+E)',
    space: 'O(V)',
    shortest: 'no',
    weights: 'no',
    insight: 'Dash commits to one direction at a time. Sometimes he gets lucky, but his paths are rarely short.',
  },
  greedy: {
    hero: 'GOBBO',
    title: 'The Greedy Goblin',
    quote: 'The gold is THAT way. Straight line. What could possibly go wrong?',
    stats: { haste: 5, brains: 3, caution: 1 },
    tagline: 'Always heads for whatever looks closest.',
    analogy: 'Like walking toward a tower you can see over the rooftops. Fast in open space, but easy to lure into a dead-end alley.',
    how: [
      'Score each tile only by its estimated distance to the goal (h). Ignore the distance already travelled.',
      'Always explore the tile that looks closest to the goal.',
      'It usually explores very few tiles, but it can be fooled into long detours.',
    ],
    time: 'O(E log V)',
    space: 'O(V)',
    shortest: 'no',
    weights: 'no',
    insight: 'Gobbo beelined straight for the gold. Very efficient when the way is clear.',
  },
};

const SHORTEST = { yes: ['yes', 'YES'], steps: ['mid', 'FEWEST STEPS'], no: ['no', 'NO'] };
const SLIME = { yes: ['yes', 'AVOIDS IT'], no: ['no', 'WADES IN'] };

function factsHTML(info) {
  const [sc, st] = SHORTEST[info.shortest];
  const [wc, wt] = SLIME[info.weights];
  return `<dl class="facts">
    <div><dt>SHORTEST PATH</dt><dd class="${sc}">${st}</dd></div>
    <div><dt>SLIME</dt><dd class="${wc}">${wt}</dd></div>
    <div><dt>TIME</dt><dd>${info.time}</dd></div>
    <div><dt>MEMORY</dt><dd>${info.space}</dd></div>
  </dl>`;
}

const bar = (n) => `<span class="bar">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}</span>`;

/** The fighter stat card shown beside the board. */
export function renderFighterCard(el, id) {
  const meta = getAlgorithm(id);
  const info = INFO[id];
  el.style.setProperty('--c', meta.color);
  el.innerHTML = `
    <div class="card-head">
      <div class="card-portrait"></div>
      <div>
        <h3 class="card-name">${info.hero}</h3>
        <p class="card-algo">${meta.name}</p>
        <p class="card-title">${info.title}</p>
      </div>
    </div>
    <dl class="bars">
      <div><dt>HASTE</dt><dd>${bar(info.stats.haste)}</dd></div>
      <div><dt>BRAINS</dt><dd>${bar(info.stats.brains)}</dd></div>
      <div><dt>CAUTION</dt><dd>${bar(info.stats.caution)}</dd></div>
    </dl>
    ${factsHTML(info)}
    <h4 class="card-sub">HOW IT WORKS</h4>
    <ol class="card-how">${info.how.map((s) => `<li>${s}</li>`).join('')}</ol>`;
  el.querySelector('.card-portrait').append(spriteEl(id, 'sprite-xl'));
}

/**
 * The HINT box: an RPG dialogue window that types each message out letter by
 * letter. When the search runs faster than the typing, intermediate messages
 * are skipped so the box always shows something current.
 */
export class HintBox {
  constructor(root) {
    this.root = root;
    this.text = root.querySelector('#hint-text');
    this.name = root.querySelector('#hint-name');
    this.facts = root.querySelector('#hint-facts');
    this.sprite = root.querySelector('#hint-sprite');
    this.log = root.querySelector('#explain-log');
    this.countEl = root.querySelector('#explain-count');
    this.count = 0;
    this.current = null;
    this.pending = null;
    this.skipped = 0;
    this.raf = 0;
    this.tick = this.tick.bind(this);
  }

  setAlgorithm(id) {
    const meta = getAlgorithm(id);
    const info = INFO[id];
    this.root.style.setProperty('--c', meta.color);
    setSprite(this.sprite, id);
    this.name.textContent = info.hero;
    const [, st] = SHORTEST[info.shortest];
    const [, wt] = SLIME[info.weights];
    this.facts.textContent = `${meta.short.toUpperCase()} · TIME ${info.time} · SHORTEST: ${st} · SLIME: ${wt}`;
    this.reset(`"${info.quote}" ${info.how.join(' ')}`);
  }

  reset(msg) {
    this.count = 0;
    this.current = null;
    this.pending = null;
    this.skipped = 0;
    this.log.replaceChildren();
    this.text.textContent = '';
    this.countEl.textContent = '';
    if (msg) this.push(msg, 'info', false);
  }

  push(msg, kind = 'step', counted = true) {
    if (!msg) return;
    if (counted) this.count++;
    const item = { msg, kind, n: counted ? this.count : 0 };
    if (!this.current) this.begin(item);
    else {
      if (this.pending) this.skipped++;
      this.pending = item;
    }
    this.countEl.textContent = this.count ? `STEP ${this.count}` : '';
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  begin(item) {
    if (this.current) this.archive(this.current);
    if (this.skipped) {
      this.archive({ msg: `…${this.skipped} steps flew by. Lower the speed to read every one.`, kind: 'skip', n: 0 });
      this.skipped = 0;
    }
    this.current = item;
    this.pos = 0;
    this.holdUntil = 0;
    this.root.classList.toggle('is-done', item.kind === 'done');
  }

  archive(item) {
    const li = document.createElement('li');
    li.className = item.kind;
    li.textContent = (item.n ? `${item.kind === 'done' ? 'RESULT' : item.n}: ` : '') + item.msg;
    this.log.prepend(li);
    while (this.log.children.length > 4) this.log.lastElementChild.remove();
  }

  tick(t) {
    this.raf = 0;
    const cur = this.current;
    if (!cur) return;
    if (this.pos < cur.msg.length) {
      // Type faster when there's a backlog.
      this.pos = Math.min(cur.msg.length, this.pos + (this.pending ? 6 : 2));
      this.text.textContent = cur.msg.slice(0, this.pos);
      this.root.classList.add('typing');
      sfx.type();
    } else {
      this.root.classList.remove('typing');
      if (!this.pending) return; // finished; wait for the next message
      if (!this.holdUntil) this.holdUntil = t + 140;
      if (t >= this.holdUntil) {
        const next = this.pending;
        this.pending = null;
        this.begin(next);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  }
}

/** Fighter bios and the move-list table on the help screen. */
export function renderLearn(cardsEl, tableEl, onTry) {
  cardsEl.innerHTML = ALGORITHMS.map((a) => {
    const info = INFO[a.id];
    return `
      <article class="bio" style="--c:${a.color}" data-id="${a.id}">
        <div class="bio-portrait"></div>
        <div class="bio-text">
          <h3>${info.hero} <small>${a.name}</small></h3>
          <p class="bio-title">${info.title}</p>
          <p>${info.analogy}</p>
          <button class="link-btn" data-try="${a.id}">PLAY AS ${info.hero} &gt;</button>
        </div>
      </article>`;
  }).join('');
  for (const bio of cardsEl.querySelectorAll('.bio')) {
    bio.querySelector('.bio-portrait').append(spriteEl(bio.dataset.id, 'sprite-xl'));
  }
  cardsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-try]');
    if (b) onTry(b.dataset.try);
  });

  tableEl.innerHTML = `
    <thead><tr><th>FIGHTER</th><th>STRATEGY</th><th>SHORTEST PATH?</th><th>SLIME?</th><th>TIME</th></tr></thead>
    <tbody>${ALGORITHMS.map((a) => {
      const info = INFO[a.id];
      const [sc, st] = SHORTEST[info.shortest];
      const [wc, wt] = SLIME[info.weights];
      return `<tr style="--c:${a.color}">
        <td class="name">${info.hero}<small>${a.short}</small></td>
        <td>${info.tagline}</td>
        <td class="${sc}">${st}</td>
        <td class="${wc}">${wt}</td>
        <td class="mono">${info.time}</td>
      </tr>`;
    }).join('')}</tbody>`;
}
