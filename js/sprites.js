// sprites.js: the fixed 16-colour palette and pixel-art sprites, drawn in code.
//
// Every sprite is 10x12 pixels, with two frames for a walk cycle. Frames are
// rendered into a 24x12 sprite sheet (each frame padded to 12x12 so it fills a
// square grid cell), which CSS flips between with steps().

// PICO-8 palette. Every colour on the site comes from this list.
export const PALETTE = [
  '#000000', // 0  black
  '#1D2B53', // 1  navy
  '#7E2553', // 2  plum
  '#008751', // 3  forest
  '#AB5236', // 4  brown
  '#5F574F', // 5  charcoal
  '#C2C3C7', // 6  silver
  '#FFF1E8', // 7  white
  '#FF004D', // 8  red
  '#FFA300', // 9  orange
  '#FFEC27', // 10 yellow
  '#00E436', // 11 green
  '#29ADFF', // 12 blue
  '#83769C', // 13 lavender
  '#FF77A8', // 14 pink
  '#FFCCAA', // 15 peach
];

const KEY = { k: 0, n: 1, p: 2, g: 3, b: 4, d: 5, l: 6, w: 7, r: 8, o: 9, y: 10, G: 11, B: 12, v: 13, P: 14, s: 15 };

/** Build frame 2 from frame 1 by replacing some rows. */
const variant = (base, rows) => base.map((row, i) => rows[i] ?? row);

const astar1 = [
  '....yy....',
  '...BBBB...',
  '..BByyBB..',
  '.BBBBBBBB.',
  '..ssssss.y',
  '..skssks.b',
  '..wwwwww.b',
  '...wwww..b',
  '.BBBBBBBsb',
  '.sBBBBBB.b',
  '..BB..BB.b',
  '..kk..kk..',
];
const dijkstra1 = [
  '..........',
  '...llll...',
  '..llllll..',
  '.llllllll.',
  '..ssssss..',
  '..skssks..',
  '..ssssss..',
  '...PPPP...',
  '.sPPPPPP..',
  '..PPPPPPsy',
  '..dd..dd.o',
  '..kk..kk..',
];
const bfs1 = [
  '..........',
  '..........',
  '.ww....ww.',
  'wkwGGGGwkw',
  'GGGGGGGGGG',
  'GGGGGGGGGG',
  'GkGGGGGGkG',
  'GGkkkkkkGG',
  '.GGGGGGGG.',
  '.gGGyyGGg.',
  'gg.gGGg.gg',
  '..........',
];
const bfs2 = [
  '..........',
  '.ww....ww.',
  'wkwGGGGwkw',
  'GGGGGGGGGG',
  'GGGGGGGGGG',
  'GkGGGGGGkG',
  'GGkkkkkkGG',
  '.GGGGGGGG.',
  '.gGGyyGGg.',
  '..gGGGGg..',
  '.g......g.',
  'g........g',
];
const dfs1 = [
  '..........',
  '...bbbb...',
  '..bbbbbb..',
  '..rrrrrrrr',
  '..ssssss.r',
  '..skssks..',
  '..ssssss..',
  '...rrrr...',
  '.srrrrrr..',
  '..rrrrrrs.',
  '..nn..nn..',
  '.kk....kk.',
];
const greedy1 = [
  '..........',
  'g........g',
  'gg.gggg.gg',
  '.gggggggg.',
  '.gyggggyg.',
  '.gggggggg.',
  '.gkwkwkwg.',
  '..gggggg..',
  '..oooooo..',
  '.gooooooyy',
  '..bb..bb..',
  '..kk..kk..',
];
const goal1 = [
  '..........',
  '..wrrrr...',
  '..wrrrrrr.',
  '..wrrrrrrr',
  '..wrrrr...',
  '..w.......',
  '..w.......',
  '..w.......',
  '..w.......',
  '..w.......',
  '.dwd......',
  '.ddd......',
];

export const SPRITES = {
  astar: [astar1, variant(astar1, { 8: '.sBBBBBBsb', 9: '.BBBBBBB.b', 10: '...BBBB..b', 11: '...kkkk...' })],
  dijkstra: [dijkstra1, variant(dijkstra1, { 8: '..PPPPPPs.', 9: '.sPPPPPP.y', 10: '...dddd..o', 11: '...kkkk...' })],
  bfs: [bfs1, bfs2],
  dfs: [dfs1, variant(dfs1, { 3: '..rrrrrrr.', 4: '..ssssssrr', 8: '..rrrrrrs.', 9: '.srrrrrr..', 10: '...nnnn...', 11: '...kkkk...' })],
  greedy: [greedy1, variant(greedy1, { 6: '.gkkkkkkg.', 10: '...bbbb...', 11: '...kkkk...' })],
  goal: [goal1, variant(goal1, { 1: '..wrrrrr..', 2: '..wrrrrrrr', 3: '..wrrrrrr.', 4: '..wrr.....' })],
};

/** Draw one frame at (x, y) on a 2D context, `scale` canvas pixels per sprite pixel. */
export function drawSprite(ctx, id, frame, x, y, scale = 1) {
  const rows = SPRITES[id][frame % 2];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const k = rows[r][c];
      if (k === '.') continue;
      ctx.fillStyle = PALETTE[KEY[k]];
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

const sheets = {};

/** Data URL of a 24x12 sheet: frame 1 in the left 12x12, frame 2 in the right. */
export function sheetURL(id) {
  if (!sheets[id]) {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 12;
    const ctx = c.getContext('2d');
    drawSprite(ctx, id, 0, 1, 0);
    drawSprite(ctx, id, 1, 13, 0);
    sheets[id] = c.toDataURL();
  }
  return sheets[id];
}

/** Turn an element into an animated sprite (see .sprite in the CSS). */
export function spriteEl(id, extraClass = '') {
  const el = document.createElement('span');
  el.className = `sprite ${extraClass}`.trim();
  el.style.backgroundImage = `url(${sheetURL(id)})`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function setSprite(el, id) {
  el.style.backgroundImage = `url(${sheetURL(id)})`;
}
