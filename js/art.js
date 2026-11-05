'use strict';
/*
 * Pixel art toolkit: drawing helpers, a 3x5 bitmap font and the palette-indexed sprites.
 * A sprite is a list of strings; each character is looked up in a palette and '.' is transparent.
 */
const Art = (() => {
  // ---------------------------------------------------------------- drawing helpers

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }

  // Small seeded random generator so the scenery is the same on every visit.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function disc(g, cx, cy, r, col) {
    g.fillStyle = col;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy));
      g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
    }
  }

  function ellipse(g, cx, cy, rx, ry, col) {
    g.fillStyle = col;
    ry = Math.max(1, Math.round(ry));
    for (let dy = -ry; dy <= ry; dy++) {
      const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
      g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
    }
  }

  function line(g, x0, y0, x1, y1, w, col) {
    g.fillStyle = col;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const off = Math.floor(w / 2);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      g.fillRect(x - off, y - off, w, w);
    }
  }

  // A pointed roof or spire: a triangle with its apex at (cx, top).
  function roof(g, cx, top, halfW, h, col) {
    g.fillStyle = col;
    for (let i = 0; i < h; i++) {
      const w = Math.round((halfW * i) / Math.max(1, h - 1));
      g.fillRect(cx - w, top + i, w * 2 + 1, 1);
    }
  }

  function sprite(w, h, layers, pal) {
    const [c, g] = canvas(w, h);
    for (const { rows, x = 0, y = 0 } of layers) {
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const col = pal[row[rx]];
          if (!col) continue;
          g.fillStyle = col;
          g.fillRect(x + rx, y + ry, 1, 1);
        }
      });
    }
    return c;
  }

  // Quarter turn clockwise: the top of the sprite ends up on the right.
  function rotate(src) {
    const [c, g] = canvas(src.height, src.width);
    g.translate(src.height, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(src, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- font

  const FONT = {
    A: ['111', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['110', '001', '010', '100', '111'], 3: ['110', '001', '010', '001', '110'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'],
    6: ['011', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '110'],
    ' ': ['000', '000', '000', '000', '000'], '-': ['000', '000', '111', '000', '000'],
    "'": ['010', '010', '000', '000', '000'], '.': ['000', '000', '000', '000', '010'],
    ',': ['000', '000', '000', '010', '100'], '!': ['010', '010', '010', '000', '010'],
    '?': ['110', '001', '010', '000', '010'], ':': ['000', '010', '000', '010', '000'],
    '&': ['010', '101', '010', '101', '011'], '(': ['001', '010', '010', '010', '001'],
    ')': ['100', '010', '010', '010', '100'], '/': ['001', '001', '010', '100', '100'],
  };

  // Converts any name into characters the font can draw (accents stripped, unknowns become '?').
  function glyphs(str) {
    return String(str)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .split('')
      .map(ch => (FONT[ch] ? ch : '?'))
      .join('');
  }

  function textWidth(text, scale = 1) {
    return text.length ? (text.length * 4 - 1) * scale : 0;
  }

  function drawText(g, text, x, y, col, scale = 1) {
    g.fillStyle = col;
    for (let i = 0; i < text.length; i++) {
      const glyph = FONT[text[i]] || FONT['?'];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          if (glyph[r][c] === '1') g.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale);
        }
      }
    }
  }

  // Outlined text, rendered once and cached as a small canvas.
  const labelCache = new Map();
  function label(text, col, outline = '#0b0510', scale = 1) {
    const key = `${text}|${col}|${outline}|${scale}`;
    let c = labelCache.get(key);
    if (!c) {
      let g;
      [c, g] = canvas(textWidth(text, scale) + 2 * scale, 7 * scale);
      const o = scale >= 3 ? 1 : scale; // a thin outline on big text, so letters don't merge into a block
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        drawText(g, text, scale + dx * o, scale + dy * o, outline, scale);
      }
      drawText(g, text, scale, scale, col, scale);
      labelCache.set(key, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- villagers (12 x 18, facing right)

  const VILLAGER_BODY = [
    '...ccc......',
    '..ccccc.....',
    '..Ccsss.....',
    '..Ccses.....',
    '..Ccsss.....',
    '...Cccc.....',
    '..cccccc....',
    '.cccccccCss.',
    '.cCccccc..i.',
    '.cCccccc.iyi',
    '.cCccccc.iyi',
    '.cCcccc..iii',
    '..Ccccc.....',
    '..Cccccc....',
  ];

  const VILLAGER_RUN = [
    ['..pp..pp....', '.pp....pp...', '.b......b...', 'bb......bb..'],
    ['...pppp.....', '...pp.p.....', '....pp......', '....bbb.....'],
    ['...pp.pp....', '..pp...pp...', '..b.....b...', '.bb......bb.'],
    ['...ppp......', '....pp......', '....pb......', '....bbb.....'],
  ];

  const VILLAGER_STAND = ['...pp.pp....', '...pp.pp....', '...pp.pp....', '..bbb.bbb...'];

  // Santa hat for Christmas, flopping back over the hood. Its bottom row overlaps the top of the head.
  const HAT_PALETTE = { R: '#c8202c', Q: '#8e1420', S: '#f2eee6', P: '#ffffff' };
  const VILLAGER_HAT = [
    '.PP.........',
    '.PPRRR......',
    '...RRRRR....',
    '..QRRRRR....',
    '..SSSSSS....',
  ];
  const VILLAGER_HAT_LIFT = VILLAGER_HAT.length - 1;

  const CLOAKS = [
    ['#8a2f34', '#5c1d22'], ['#2f5688', '#1f385a'], ['#55762f', '#384f1f'], ['#86662f', '#5a441f'],
    ['#63308a', '#41205c'], ['#2f8576', '#1f594e'], ['#9a5224', '#683617'], ['#66667a', '#444452'],
    ['#88305f', '#5c1f40'], ['#47592f', '#2f3b1f'], ['#9c8050', '#695634'], ['#5a4030', '#3a291e'],
  ];
  const SKINS = ['#e8bf96', '#c98f5e', '#8d5a3a', '#f2cfa8', '#a8714a', '#d8a878'];

  const villagerCache = new Map();
  function villager(style, xmas = false) {
    const key = Math.abs(style | 0) % CLOAKS.length;
    const cacheKey = xmas ? `${key}x` : key;
    if (villagerCache.has(cacheKey)) return villagerCache.get(cacheKey);
    const [c, C] = CLOAKS[key];
    const pal = { ...HAT_PALETTE, c, C, s: SKINS[(key * 5) % SKINS.length], e: '#140a0a', i: '#2b2424', y: '#ffd866', p: '#3a2e2a', b: '#1c1410' };
    const empty = { ...pal, i: null, y: null }; // lantern dropped
    const lift = xmas ? VILLAGER_HAT_LIFT : 0;
    const hat = xmas ? [{ rows: VILLAGER_HAT }] : [];
    const make = (legs, p) => sprite(12, 18 + lift, [{ rows: VILLAGER_BODY, y: lift }, { rows: legs, y: 14 + lift }, ...hat], p);
    const sprites = {
      idle: make(VILLAGER_STAND, pal),
      run: VILLAGER_RUN.map(legs => make(legs, pal)),
      flee: VILLAGER_RUN.map(legs => make(legs, empty)),
      held: [rotate(make(VILLAGER_RUN[0], empty)), rotate(make(VILLAGER_RUN[2], empty))],
    };
    villagerCache.set(cacheKey, sprites);
    return sprites;
  }

  // ---------------------------------------------------------------- the scrum monster (32 x 45, facing right)
  // A hulking zombie rugby forward in a torn, hooped jersey.

  const MONSTER_PALETTE = {
    H: '#1d1812', g: '#7f9e5c', G: '#5b7440', d: '#3e5230', e: '#ff4022', m: '#2a0808', t: '#e6dcbc',
    r: '#8e1b1b', J: '#7c1a2a', K: '#4c0e18', j: '#c9a227', k: '#8a6c16', w: '#d6cfb6', W: '#a59e86',
    B: '#1a1612', b: '#6c6252', c: '#e6e2d0',
  };

  const HEAD = [
    '................H.HHH.H.........',
    '..............HHHHHHHHH.........',
    '.............HHHgggggggH........',
    '.............HHgggggggggg.......',
    '.............HgggggggggGee......',
    '.............Ggggggggggggggg....',
    '.............GggggrggggggggG....',
    '.............GGgggggggmmmmmm....',
    '..............GGgggggtmtmtm.....',
    '...............GGGgggggggG......',
  ];

  // Shoulders to shorts, with the near arm reaching forward. Drawn from row 10 of a frame.
  const TORSO = [
    '..........cJJJJJJJGGGG..........',
    '........JJJJJJJJJJJJJJJJ........',
    '.......JJJJJJJJJJJJJJJJJJJJJ....',
    '......jjjjjjjjjjjjjjjjjjjjjgg...',
    '......jjjjjjjjjjjjjjjjjjjjjggggg',
    '......jjjjjjjjjjjjjjjkkkkkkgGg.g',
    '.....JJJJJJJJJJJJJJJK...........',
    '.....JJJJJJJJJJJJJJJK...........',
    '.....JJJJJJJJJrJJJJJK...........',
    '.....jjjjjjjjjgjjjjjk...........',
    '.....jjjjjjjjjjjjjjjk...........',
    '.....jjjjjjjjjjjjjjjk...........',
    '.....JJJJJJJJJJJJJJJK...........',
    '......JJJJJJJJJJJJJJK...........',
    '......JJJJJJJJJJJJJK............',
    '......jjjjjjjjjjjjjk............',
    '......wwwwwwwwwwwwwW............',
    '......wwwwwwwwwwwwwW............',
    '......wwwwwwwwwwwwwW............',
    '......wwwwwwW.wwwwwW............',
  ];

  const FAR_ARM = ['KKKKKdddd', 'KKKKKddddd', 'kkkkkd.d.d'];

  // Victory pose: one arm raised (to hold the catch aloft) and the jaw hanging open in a roar.
  const TRIUMPH_TOP = [
    '.......g.g.g....................',
    '.......ggggg....................',
    '.......gGggg....................',
    '........ggg.....................',
    '.......JJJJ.....................',
    '.......jjjj.....................',
    '.......jjjj.........H.HH.H......',
    '.......JJJJ........HHHHHHHHH....',
    '.......JJJJ.......HHHgggggggH...',
    '.......jjjj.......HHgggggggGee..',
    '.......jjjj.......Hgggggggggggg.',
    '.......JJJJ.......Gggggrggggttt.',
    '.......JJJJ.......Gggggggggmmmm.',
    '.......jjjj.......GGgggggggmmmmm',
    '.......jjjj........GGgggggggttt.',
    '.......JJJJ.........GGGGGGGGG...',
    '.......JJJJ.....................',
  ];

  const LEGS_STRIDE = [
    '.........ggggg.ggggg............',
    '........gggggG..ggggg...........',
    '.......ggggG.....ggggg..........',
    '......gggggG......gggg..........',
    '.....JJJJJ........gggG..........',
    '....jjjjj.........JJJJ..........',
    '...JJJJJ..........jjjj..........',
    '..jjjjj...........JJJJ..........',
    '.BBBBB............jjjj..........',
    'BBBBb.............JJJJ..........',
    'BBb...............jjjj..........',
    '..................JJJJ..........',
    '..................BBBBBB........',
    '..................BBBBBBB.......',
    '..................bB.bB.b.......',
  ];

  const LEGS_PASS = [
    '.........gggggggggg.............',
    '..........gggggggg..............',
    '...........gggg.gggg............',
    '...........ggggG.gggg...........',
    '...........JJJJ...JJJJ..........',
    '...........jjjj...jjjj..........',
    '...........JJJJ...JJJJ..........',
    '...........jjjj...jjjj..........',
    '...........JJJJ..BBBBBB.........',
    '...........jjjj..BBBBB..........',
    '...........JJJJ.................',
    '...........jjjj.................',
    '..........BBBBBB................',
    '..........BBBBBBB...............',
    '..........bB.bB.b...............',
  ];

  const LEGS_STAND = [
    '........gggggggggg..............',
    '........gggg..gggg..............',
    '........gggG..gggG..............',
    '........gggg..gggg..............',
    '........JJJJ..JJJJ..............',
    '........jjjj..jjjj..............',
    '........JJJJ..JJJJ..............',
    '........jjjj..jjjj..............',
    '........JJJJ..JJJJ..............',
    '........jjjj..jjjj..............',
    '........JJJJ..JJJJ..............',
    '........jjjj..jjjj..............',
    '.......BBBBBB.BBBBBB............',
    '.......BBBBBB.BBBBBB............',
    '.......bB.bB..bB.bB.............',
  ];

  // A big Santa hat for the big monster. The bottom two rows (the trim) sit over the top of the head.
  const MONSTER_HAT = [
    '........PP......................',
    '.......PPPRR....................',
    '........PRRRRRR.................',
    '...........RRRRRRRR.............',
    '............QRRRRRRRRR..........',
    '.............QRRRRRRRRRR........',
    '.............SSSSSSSSSSSS.......',
    '............SSSSSSSSSSSSS.......',
  ];
  const MONSTER_HAT_LIFT = MONSTER_HAT.length - 2;

  // Darkens the far leg so the run cycle reads as alternating legs.
  const DARKER = { g: 'G', G: 'd', J: 'K', j: 'k', w: 'W' };
  function shadeCols(rows, from, to) {
    return rows.map(row => row.split('').map((ch, x) => (x >= from && x <= to && DARKER[ch]) || ch).join(''));
  }

  const monsterCache = {};
  function monster(xmas = false) {
    const cacheKey = xmas ? 'xmas' : 'plain';
    if (monsterCache[cacheKey]) return monsterCache[cacheKey];
    const P = { ...MONSTER_PALETTE, ...HAT_PALETTE };
    const lift = xmas ? MONSTER_HAT_LIFT : 0;
    const frame = (legs, dy) => sprite(32, 45 + lift, [
      { rows: legs, y: 30 + lift },
      { rows: HEAD, y: lift + dy },
      { rows: TORSO, y: 10 + lift + dy },
      { rows: FAR_ARM, x: 21, y: 17 + lift + dy },
      ...(xmas ? [{ rows: MONSTER_HAT, y: dy }] : []),
    ], P);
    const pass = shadeCols(LEGS_PASS, 15, 31);
    const run = [frame(shadeCols(LEGS_STRIDE, 0, 13), 0), frame(pass, 1), frame(shadeCols(LEGS_STRIDE, 14, 31), 0), frame(pass, 1)];
    monsterCache[cacheKey] = {
      run,
      stand: frame(shadeCols(LEGS_STAND, 0, 12), 0),
      dive: rotate(run[0]),
      // The roaring head sits lower in this pose, so the hat has room above it without extra rows.
      triumph: sprite(32, 51, [
        { rows: shadeCols(LEGS_STAND, 0, 12), y: 36 },
        { rows: TORSO, y: 16 },
        { rows: TRIUMPH_TOP },
        ...(xmas ? [{ rows: MONSTER_HAT, x: 5 }] : []),
      ], P),
      // Where the glowing eyes sit within each pose.
      eyes: { run: [25, 4 + lift], stand: [25, 4 + lift], triumph: [29, 9] },
    };
    return monsterCache[cacheKey];
  }

  // ---------------------------------------------------------------- odds and ends

  const BAT_PALETTE = { k: '#06030a', r: '#d0302a' };
  const bats = [
    sprite(7, 3, [{ rows: ['k.....k', '.k.k.k.', '..krk..'] }], BAT_PALETTE),
    sprite(7, 3, [{ rows: ['..krk..', '.kkkkk.', 'k.....k'] }], BAT_PALETTE),
  ];

  function glowSprite(size, rings) {
    const [c, g] = canvas(size, size);
    for (const [r, col] of rings) disc(g, size / 2, size / 2, r, col);
    return c;
  }

  const glow = glowSprite(48, [
    [22, 'rgba(255,150,50,0.05)'],
    [16, 'rgba(255,165,60,0.07)'],
    [10, 'rgba(255,190,80,0.10)'],
    [5, 'rgba(255,220,130,0.16)'],
  ]);
  const eyeGlow = glowSprite(16, [[7, 'rgba(255,40,20,0.12)'], [4, 'rgba(255,60,30,0.22)']]);

  return {
    canvas, rng, disc, ellipse, line, roof, sprite, rotate,
    glyphs, textWidth, drawText, label,
    villager, monster, bats, glow, eyeGlow, VILLAGER_HAT_LIFT,
  };
})();
