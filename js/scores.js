// scores.js: the high-score table (saved in localStorage) and the arcade-style
// three-letter initials entry.

import { sfx } from './sound.js';

const KEY = 'mazelab.hiscores.v1';
const MAX = 10;

// The table ships with a few "CPU" scores, like a real cabinet.
const DEFAULTS = [
  { name: 'ACE', score: 6000, fighter: 'astar', level: 'LEVEL 3' },
  { name: 'DIJ', score: 5000, fighter: 'dijkstra', level: 'LEVEL 2' },
  { name: 'FRG', score: 4000, fighter: 'bfs', level: 'LEVEL 1' },
  { name: 'GOB', score: 3000, fighter: 'greedy', level: 'LEVEL 1' },
  { name: 'RUN', score: 2000, fighter: 'dfs', level: 'LEVEL 2' },
];

export function loadScores() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(v)) return v;
  } catch { /* storage blocked or corrupt: fall back to defaults */ }
  return DEFAULTS.map((s) => ({ ...s }));
}

function store(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function qualifies(score) {
  const list = loadScores();
  return list.length < MAX || score > list[list.length - 1].score;
}

/** Insert an entry; returns its 0-based rank, or -1 if it didn't make the table. */
export function saveScore(entry) {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const rank = list.indexOf(entry);
  store(list.slice(0, MAX));
  return rank < MAX ? rank : -1;
}

export function resetScores() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const topScore = () => loadScores()[0]?.score ?? 0;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-';

/**
 * Render a three-slot initials picker into `container`. Works with arrow
 * buttons (touch), the keyboard (type letters, arrows, Enter) or both.
 */
export function initialsPicker(container, onSubmit) {
  const letters = [0, 0, 0];
  let active = 0;
  container.innerHTML = `
    <div class="initials" role="group" aria-label="Enter your initials">
      ${[0, 1, 2].map((i) => `
        <div class="slot" data-i="${i}">
          <button class="arrow up" data-dir="-1" aria-label="Previous letter for slot ${i + 1}"></button>
          <span class="letter" tabindex="0">A</span>
          <button class="arrow down" data-dir="1" aria-label="Next letter for slot ${i + 1}"></button>
        </div>`).join('')}
      <button class="btn btn-go" data-enter>ENTER</button>
    </div>`;
  const slots = [...container.querySelectorAll('.slot')];

  const render = () => slots.forEach((s, i) => {
    s.querySelector('.letter').textContent = LETTERS[letters[i]];
    s.classList.toggle('active', i === active);
  });
  const bump = (i, d) => {
    letters[i] = (letters[i] + d + LETTERS.length) % LETTERS.length;
    active = i;
    sfx.letter();
    render();
  };
  const submit = () => {
    document.removeEventListener('keydown', onKey);
    onSubmit(letters.map((l) => LETTERS[l]).join(''));
  };
  const onKey = (e) => {
    if (!container.isConnected || !container.offsetParent) { document.removeEventListener('keydown', onKey); return; }
    const k = e.key.toUpperCase();
    if (k.length === 1 && LETTERS.includes(k)) {
      letters[active] = LETTERS.indexOf(k);
      active = Math.min(2, active + 1);
      sfx.letter();
    } else if (e.key === 'ArrowUp') bump(active, -1);
    else if (e.key === 'ArrowDown') bump(active, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'Backspace') active = Math.max(0, active - 1);
    else if (e.key === 'ArrowRight') active = Math.min(2, active + 1);
    else if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    else return;
    e.preventDefault();
    render();
  };

  container.addEventListener('click', (e) => {
    const arrow = e.target.closest('[data-dir]');
    if (arrow) { bump(+arrow.closest('.slot').dataset.i, +arrow.dataset.dir); return; }
    const slot = e.target.closest('.slot');
    if (slot) { active = +slot.dataset.i; render(); }
    if (e.target.closest('[data-enter]')) submit();
  });
  document.addEventListener('keydown', onKey);
  render();
}
