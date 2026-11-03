'use strict';
/*
 * The parallax backdrop. Each layer is painted once into a 960px-wide tile that repeats seamlessly,
 * then scrolled at its own speed: sky and moon (fixed), clouds, far castle hills, dead woods,
 * the graveyard path the villagers run along, and an iron fence in the foreground.
 */
const Scene = (() => {
  const W = 480, H = 270, LW = 960;
  const TAU = Math.PI * 2;
  const MOON = { x: 372, y: 62 };
  const L = {};
  let twinkles = [];

  function build() {
    const rand = Art.rng(1031);
    L.sky = buildSky(rand);
    L.clouds = buildClouds(rand);
    L.far = buildFar(rand);
    L.mid = buildMid(rand);
    L.ground = buildGround(rand);
    L.fore = buildFore(rand);
    L.fogHigh = buildFog(rand, 60, 'rgba(200,180,230,0.045)');
    L.fogLow = buildFog(rand, 50, 'rgba(190,170,220,0.04)');
    L.vignette = buildVignette();
  }

  // Draws a shape three times so anything that crosses the tile edge wraps round.
  const wrapped = draw => { for (const o of [-LW, 0, LW]) draw(o); };

  // ---------------------------------------------------------------- sky and moon

  function buildSky(rand) {
    const [c, g] = Art.canvas(W, H);
    const bands = ['#06030b', '#0a0512', '#0f0719', '#150a22', '#1c0d2c', '#241135', '#2d153d', '#371a44', '#41204a'];
    const bandH = 22;
    for (let y = 0; y < H; y++) {
      const i = Math.min(bands.length - 1, Math.floor(y / bandH));
      g.fillStyle = bands[i];
      g.fillRect(0, y, W, 1);
      const into = y % bandH, next = bands[i + 1];
      if (next && into >= bandH - 4) {
        // Ordered dither into the next band.
        const every = into >= bandH - 2 ? 2 : 4;
        g.fillStyle = next;
        for (let x = (y % 2) * (every / 2); x < W; x += every) g.fillRect(x, y, 1, 1);
      }
    }

    for (let i = 0; i < 110; i++) {
      const x = Math.floor(rand() * W), y = Math.floor(rand() * 150);
      if (Math.hypot(x - MOON.x, y - MOON.y) < 36) continue;
      g.fillStyle = rand() < 0.3 ? '#d8ccff' : '#5c4a7c';
      g.fillRect(x, y, 1, 1);
    }
    twinkles = Array.from({ length: 16 }, () => ({
      x: Math.floor(rand() * W), y: Math.floor(rand() * 120), phase: rand() * TAU, speed: 0.8 + rand() * 2,
    })).filter(s => Math.hypot(s.x - MOON.x, s.y - MOON.y) > 40);

    const { x, y } = MOON;
    Art.disc(g, x, y, 46, 'rgba(150,30,50,0.08)');
    Art.disc(g, x, y, 38, 'rgba(190,50,60,0.10)');
    Art.disc(g, x, y, 31, 'rgba(240,210,180,0.10)');
    Art.disc(g, x, y, 26, '#cbbd98');
    Art.disc(g, x + 2, y - 2, 24, '#e9dfc4');
    for (const [dx, dy, r] of [[-8, -6, 4], [6, 4, 5], [-4, 11, 3], [10, -10, 2], [-13, 5, 2], [12, 12, 2]]) {
      Art.disc(g, x + dx, y + dy, r, '#d2c4a0');
      if (r > 2) Art.disc(g, x + dx + 1, y + dy + 1, r - 2, '#dccfac');
    }
    return c;
  }

  function buildClouds(rand) {
    const [c, g] = Art.canvas(LW, 130);
    for (let i = 0; i < 10; i++) {
      const cx = 40 + i * 92 + rand() * 30, cy = 18 + rand() * 95;
      const blobs = Array.from({ length: 5 + Math.floor(rand() * 4) }, () => [
        cx + (rand() - 0.5) * 70, cy + (rand() - 0.5) * 8, 4 + Math.floor(rand() * 8),
      ]);
      // A moonlit rim first, then the cloud body one pixel lower.
      for (const [x, y, r] of blobs) wrapped(o => Art.ellipse(g, x + o, y - 1, r * 1.9, r, '#3a2550'));
      for (const [x, y, r] of blobs) wrapped(o => Art.ellipse(g, x + o, y, r * 1.9, r, '#1b0f2a'));
    }
    return c;
  }

  // ---------------------------------------------------------------- far hills: castle, cathedral, village

  function buildFar(rand) {
    const [c, g] = Art.canvas(LW, H);
    const col = '#1d0e29';
    const hill = x => Math.round(158 + 9 * Math.sin((TAU * 2 * x) / LW) + 6 * Math.sin((TAU * 5 * x) / LW + 1.3) + 3 * Math.sin((TAU * 11 * x) / LW + 0.4));
    g.fillStyle = col;
    for (let x = 0; x < LW; x++) g.fillRect(x, hill(x), 1, H - hill(x));

    castle(g, 150, hill(172) + 3, col, rand);
    cathedral(g, 650, hill(680) + 3, col, rand);
    for (let k = 0; k < 6; k++) {
      const x = 400 + k * 24 + Math.floor(rand() * 6);
      house(g, x, hill(x + 6) + 2, col, rand);
    }
    return c;
  }

  function litWindow(g, x, y, rand) {
    g.fillStyle = rand() < 0.7 ? '#e8a848' : '#7a4a20';
    g.fillRect(x, y, 1, 2);
  }

  function castle(g, x, base, col, rand) {
    g.fillStyle = col;
    g.fillRect(x, base - 46, 44, 46);
    for (let i = 0; i < 44; i += 4) g.fillRect(x + i, base - 49, 2, 3);
    g.fillRect(x - 14, base - 66, 14, 66);
    Art.roof(g, x - 7, base - 84, 8, 18, col);
    g.fillRect(x + 44, base - 58, 12, 58);
    Art.roof(g, x + 50, base - 74, 7, 16, col);
    g.fillRect(x + 18, base - 72, 9, 26);
    Art.roof(g, x + 22, base - 96, 5, 24, col);
    g.fillRect(x + 22, base - 103, 1, 7);
    g.fillStyle = '#5a1020';
    g.fillRect(x + 23, base - 103, 4, 2);
    for (const [wx, wy] of [[6, 38], [14, 30], [30, 38], [36, 24], [-8, 56], [-8, 40], [49, 48], [22, 62], [10, 14]]) {
      litWindow(g, x + wx, base - wy, rand);
    }
  }

  function cathedral(g, x, base, col, rand) {
    g.fillStyle = col;
    g.fillRect(x, base - 40, 70, 40);
    Art.roof(g, x + 35, base - 58, 35, 18, col);
    g.fillRect(x - 12, base - 70, 16, 70);
    Art.roof(g, x - 4, base - 100, 8, 30, col);
    g.fillRect(x + 70, base - 62, 12, 62);
    Art.roof(g, x + 76, base - 84, 6, 22, col);
    Art.disc(g, x - 4, base - 50, 3, '#5a1424');
    Art.disc(g, x - 4, base - 50, 1, '#c04050');
    for (let k = 0; k < 5; k++) {
      const wx = x + 8 + k * 12;
      g.fillStyle = rand() < 0.5 ? '#c87838' : '#4a1020';
      g.fillRect(wx, base - 28, 3, 9);
      g.fillRect(wx + 1, base - 30, 1, 2);
    }
  }

  function house(g, x, base, col, rand) {
    const w = 10 + Math.floor(rand() * 6), h = 7 + Math.floor(rand() * 5);
    g.fillStyle = col;
    g.fillRect(x, base - h, w, h);
    Art.roof(g, x + Math.floor(w / 2), base - h - 6, Math.ceil(w / 2) + 1, 7, col);
    g.fillRect(x + w - 4, base - h - 6, 2, 4);
    if (rand() < 0.8) litWindow(g, x + 2 + Math.floor(rand() * (w - 4)), base - h + 2, rand);
  }

  // ---------------------------------------------------------------- dead woods and ruins

  function buildMid(rand) {
    const [c, g] = Art.canvas(LW, H);
    const col = '#110716';
    const ridge = x => Math.round(181 + 3 * Math.sin((TAU * 3 * x) / LW) + 2 * Math.sin((TAU * 7 * x) / LW + 2));
    g.fillStyle = col;
    for (let x = 0; x < LW; x++) g.fillRect(x, ridge(x), 1, H - ridge(x));

    for (const x of [100, 300, 470, 700, 860]) {
      tree(g, x, ridge(x) + 1, 24 + rand() * 10, -Math.PI / 2 + (rand() - 0.5) * 0.2, 5, 4, rand, col);
    }
    ruin(g, 560, ridge(580) + 1, col, rand);

    for (let x = 30; x < LW - 30; x += 20 + Math.floor(rand() * 40)) {
      const y = ridge(x) + 1;
      g.fillStyle = col;
      if (rand() < 0.5) {
        g.fillRect(x, y - 10, 2, 10);
        g.fillRect(x - 2, y - 8, 6, 2);
      } else {
        g.fillRect(x, y - 6, 5, 6);
        g.fillRect(x + 1, y - 7, 3, 1);
      }
    }
    return c;
  }

  function tree(g, x, y, len, ang, depth, w, rand, col) {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    Art.line(g, x, y, x2, y2, w, col);
    if (depth <= 0) return;
    const n = depth > 3 ? 2 : rand() < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * (0.5 + rand() * 0.35) + (rand() - 0.5) * 0.3;
      tree(g, x2, y2, len * (0.62 + rand() * 0.15), a, depth - 1, Math.max(1, w - 1), rand, col);
    }
  }

  // A broken wall with pointed gothic windows that let the far layer show through.
  function ruin(g, x, base, col, rand) {
    g.fillStyle = col;
    g.fillRect(x, base - 44, 54, 44);
    g.fillRect(x + 54, base - 26, 14, 26);
    for (let i = 0; i < 54; i += 3) g.clearRect(x + i, base - 44, 3, Math.floor(rand() * 9));
    for (const wx of [x + 6, x + 22, x + 38]) {
      const top = base - 36, w = 9, h = 22;
      for (let i = 0; i < 5; i++) g.clearRect(wx + 4 - Math.floor(i * 0.9), top + i, 1 + Math.floor(i * 0.9) * 2, 1);
      g.clearRect(wx, top + 5, w, h - 5);
    }
  }

  // ---------------------------------------------------------------- the graveyard path

  function buildGround(rand) {
    const [c, g] = Art.canvas(LW, H);
    g.fillStyle = '#181020';
    g.fillRect(0, 188, LW, H - 188);
    for (let x = 0; x < LW; x++) {
      g.fillStyle = '#1f1528';
      g.fillRect(x, 188, 1, 4);
      if (rand() < 0.45) {
        g.fillStyle = '#2a1c34';
        const h = 2 + Math.floor(rand() * 3);
        g.fillRect(x, 188 - h + 1, 1, h);
      }
    }
    for (let x = 6; x < LW - 20; x += 18 + Math.floor(rand() * 32)) tomb(g, x, 199, rand);

    g.fillStyle = '#211729';
    g.fillRect(0, 200, LW, 36);
    g.fillStyle = '#140c19';
    g.fillRect(0, 236, LW, H - 236);
    for (let x = 0; x < LW; x++) {
      g.fillStyle = '#1a1121';
      g.fillRect(x, 200, 1, 1 + Math.floor(rand() * 2));
      g.fillRect(x, 234 + Math.floor(rand() * 2), 1, 2);
    }
    const specks = ['#2b2034', '#160e1c', '#2f2338', '#1d1424'];
    for (let i = 0; i < 1100; i++) {
      g.fillStyle = specks[i % specks.length];
      g.fillRect(Math.floor(rand() * LW), 200 + Math.floor(rand() * 70), rand() < 0.3 ? 2 : 1, 1);
    }
    return c;
  }

  function tomb(g, x, base, rand) {
    const body = '#3a3348', light = '#575069', dark = '#27212f', etch = '#211c29';
    const t = rand();
    if (t < 0.5) {
      const w = 7 + Math.floor(rand() * 3), h = 9 + Math.floor(rand() * 4);
      g.fillStyle = body;
      g.fillRect(x, base - h + 2, w, h - 2);
      g.fillRect(x + 1, base - h + 1, w - 2, 1);
      g.fillRect(x + 2, base - h, w - 4, 1);
      g.fillStyle = light;
      g.fillRect(x + w - 1, base - h + 2, 1, h - 2);
      g.fillStyle = dark;
      g.fillRect(x, base - h + 2, 1, h - 2);
      g.fillStyle = etch;
      g.fillRect(x + 2, base - h + 4, w - 4, 1);
      g.fillRect(x + 2, base - h + 6, w - 5, 1);
    } else if (t < 0.8) {
      g.fillStyle = body;
      g.fillRect(x + 3, base - 12, 2, 12);
      g.fillRect(x, base - 9, 8, 2);
      g.fillStyle = light;
      g.fillRect(x + 4, base - 12, 1, 12);
    } else {
      g.fillStyle = body;
      g.fillRect(x + 1, base - 14, 4, 14);
      g.fillRect(x + 2, base - 16, 2, 2);
      g.fillRect(x, base - 2, 6, 2);
      g.fillStyle = light;
      g.fillRect(x + 4, base - 14, 1, 12);
    }
  }

  // ---------------------------------------------------------------- foreground fence, fog and vignette

  function buildFore(rand) {
    const [c, g] = Art.canvas(LW, H);
    const col = '#07040b', hi = '#251c30';
    g.fillStyle = col;
    g.fillRect(0, 252, LW, 2);
    g.fillRect(0, 262, LW, 2);
    for (let x = 0; x < LW; x += 12) {
      g.fillStyle = col;
      g.fillRect(x, 244, 2, 26);
      g.fillRect(x, 240, 2, 1);
      g.fillRect(x - 1, 241, 4, 2);
      g.fillRect(x, 243, 2, 1);
      g.fillStyle = hi;
      g.fillRect(x + 1, 246, 1, 6);
    }
    for (let x = 6; x < LW; x += 96) {
      g.fillStyle = col;
      g.fillRect(x, 236, 4, 34);
      Art.disc(g, x + 2, 233, 2, col);
      g.fillStyle = hi;
      g.fillRect(x + 3, 238, 1, 12);
    }
    g.fillStyle = '#0a060e';
    for (let x = 0; x < LW; x += 2) {
      if (rand() < 0.6) {
        const h = 2 + Math.floor(rand() * 6);
        g.fillRect(x, H - h, 1, h);
      }
    }
    return c;
  }

  function buildFog(rand, h, col) {
    const [c, g] = Art.canvas(LW, h);
    for (let i = 0; i < 40; i++) {
      const x = rand() * LW, y = h / 2 + (rand() - 0.5) * h * 0.5;
      const rx = 20 + rand() * 40, ry = 3 + rand() * (h / 6);
      wrapped(o => Art.ellipse(g, x + o, y, rx, ry, col));
    }
    return c;
  }

  function buildVignette() {
    const [c, g] = Art.canvas(W, H);
    const grad = g.createRadialGradient(W / 2, H * 0.55, 120, W / 2, H * 0.55, 300);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    return c;
  }

  // ---------------------------------------------------------------- drawing

  function loop(ctx, img, offset, y = 0) {
    const o = Math.floor(((offset % LW) + LW) % LW);
    ctx.drawImage(img, -o, y);
    ctx.drawImage(img, LW - o, y);
  }

  function drawSky(ctx, time) {
    ctx.drawImage(L.sky, 0, 0);
    for (const s of twinkles) {
      const a = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
      if (a < 0.4) continue;
      ctx.fillStyle = a > 0.85 ? '#ffffff' : '#bfb0ee';
      ctx.fillRect(s.x, s.y, 1, 1);
      if (a > 0.96) {
        ctx.fillRect(s.x - 1, s.y, 3, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 3);
      }
    }
  }

  // Everything behind the characters. `afterMid` draws extras that sit in the dark woods.
  function drawBehind(ctx, cam, time, afterMid) {
    ctx.globalAlpha = 0.9;
    loop(ctx, L.clouds, cam * 0.03 + time * 4);
    ctx.globalAlpha = 1;
    loop(ctx, L.far, cam * 0.12);
    loop(ctx, L.mid, cam * 0.35);
    if (afterMid) afterMid();
    loop(ctx, L.fogHigh, cam * 0.5 + time * 6, 150);
    loop(ctx, L.ground, cam);
  }

  function drawFront(ctx, cam, time) {
    loop(ctx, L.fogLow, cam * 1.1 + time * 10, 222);
    loop(ctx, L.fore, cam * 1.5);
  }

  function drawVignette(ctx) {
    ctx.drawImage(L.vignette, 0, 0);
  }

  return { build, drawSky, drawBehind, drawFront, drawVignette };
})();
