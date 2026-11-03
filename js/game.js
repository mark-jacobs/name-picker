'use strict';
/*
 * The stage director: the village at rest, the chase, the tackle and the verdict.
 * Everything is drawn at 480x270 and scaled up by CSS with crisp pixels.
 */
const Game = (() => {
  const W = 480, H = 270;
  // Chase timeline, in seconds from the referee's whistle.
  const T = { monsterIn: 0.5, monsterSet: 1.5, teases: [2.3, 3.9], fall: 5.3, dive: 6.9, diveDur: 0.3, triumph: 8.2, verdict: 9.0 };
  const MONSTER_Y = 226;
  const MS = 2;     // the monster is drawn at double size
  const REACH = 78; // how far ahead of the monster's left edge a straggler gets caught

  let ctx;
  let time = 0, cam = 0, camSpeed = 0;
  let mode = 'idle'; // idle | chase | verdict | release
  let mt = 0;        // time in the current mode
  let ct = 0;        // time since the chase began
  let runners = [], victim = null, teases = [], hooks = {};
  let info = null;
  const mon = { x: -140, y: MONSTER_Y, pose: 'hidden', lunge: 0, diveFrom: 0, eyes: null };
  let freed = null;
  let particles = [];
  let shake = 0, flash = 0, bolt = null, nextLightning = 6;
  let fade = 0, fadeDir = 0, fadeCb = null;
  let bats = [];

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const ease = u => u * u * (3 - 2 * u);

  function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function init(canvas) {
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    Scene.build();
    bats = [newBat(1), newBat(6), newBat(12)];
    let last = performance.now();
    const frame = now => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      update(dt);
      render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // Spreads the villagers over up to four depth lanes so their name labels don't collide.
  function lineup(people) {
    const n = people.length;
    if (!n) return [];
    const lanes = n <= 2 ? n : n <= 6 ? 3 : 4;
    const perLane = Math.ceil(n / lanes);
    const step = 260 / perLane;
    return people.map((p, i) => {
      const lane = i % lanes, col = Math.floor(i / lanes);
      const homeX = Math.round(175 + col * step + (lane * step) / lanes);
      return {
        name: p.name,
        style: p.style,
        label: Art.glyphs(p.name).slice(0, 12),
        homeX,
        x: homeX,
        y: lanes === 1 ? 218 : Math.round(205 + (lane * 24) / (lanes - 1)),
        offset: 0,
        anim: Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        speed: 1.6 + Math.random() * 1.2,
      };
    });
  }

  // ---------------------------------------------------------------- public API

  function showIdle(people, idleInfo) {
    runners = lineup(people);
    info = idleInfo;
    mode = 'idle';
    mt = 0;
    mon.pose = 'hidden';
    victim = null;
    freed = null;
    camSpeed = 0;
    Sound.playMusic('idle');
  }

  // `view` is called once the screen is dark, so it always returns the latest team.
  function returnToIdle(view) {
    fadeTo(() => {
      const { people, info: idleInfo } = view();
      showIdle(people, idleInfo);
    });
  }

  function chase(people, victimName, callbacks) {
    const begin = () => {
      runners = lineup(people);
      victim = runners.find(r => r.name === victimName);
      const others = shuffle(runners.filter(r => r !== victim));
      teases = T.teases.slice(0, others.length).map((t, i) => ({ t, who: others[i], swiped: false }));
      hooks = callbacks;
      mode = 'chase';
      mt = 0;
      ct = 0;
      Object.assign(mon, { x: -140, y: MONSTER_Y, pose: 'hidden', lunge: 0 });
      freed = null;
      particles = [];
      Sound.whistle();
      Sound.playMusic('chase');
    };
    const sameCrowd = mode === 'idle' && runners.map(r => r.name).join('\n') === people.map(p => p.name).join('\n');
    if (sameCrowd) begin();
    else fadeTo(begin);
  }

  // "Spare them": the monster drops its catch, who flees, then `onDone` starts the next hunt.
  function release(onDone) {
    mode = 'release';
    mt = 0;
    mon.pose = 'stand';
    freed = { x: mon.x + 10, y: mon.y - 118, vy: -40, landed: false, style: victim.style, label: victim.label, anim: 0 };
    hooks = { onDone };
    Sound.yelp();
  }

  // ---------------------------------------------------------------- update

  function update(dt) {
    time += dt;
    mt += dt;
    cam += camSpeed * dt;
    shake = Math.max(0, shake - dt * 12);
    flash = Math.max(0, flash - dt * 2.5);
    if (bolt && (bolt.life -= dt) <= 0) bolt = null;
    if (mode === 'idle' || mode === 'chase') {
      nextLightning -= dt;
      if (nextLightning <= 0) {
        lightning(false);
        nextLightning = 10 + Math.random() * 14;
      }
    }
    if (mode === 'chase' || mode === 'verdict') updateChase(dt);
    if (mode === 'release') updateRelease(dt);
    updateRunners(dt);
    updateParticles(dt);
    for (const b of bats) updateBat(b, dt);
    updateFade(dt);
  }

  function updateChase(dt) {
    ct += dt;
    const diveEnd = T.dive + T.diveDur;
    camSpeed = ct < diveEnd ? Math.min(130, camSpeed + 220 * dt) : Math.max(0, camSpeed - 150 * dt);
    mon.lunge = Math.max(0, mon.lunge - 60 * dt);

    if (ct < T.monsterIn) {
      mon.pose = 'hidden';
    } else if (ct < T.dive) {
      mon.pose = 'run';
      const enter = ease(clamp01((ct - T.monsterIn) / (T.monsterSet - T.monsterIn)));
      mon.x = lerp(-130, 6, enter) + Math.max(0, ct - T.monsterSet) * 7 + Math.sin(ct * 2.7) * 3;
      mon.y = Math.round(lerp(MONSTER_Y, victim.y, ease(clamp01((ct - T.fall) / (T.dive - T.fall)))));
      for (const tz of teases) {
        if (!tz.swiped && ct >= tz.t + 0.5) {
          tz.swiped = true;
          mon.lunge = 18;
          Sound.swipe();
        }
      }
    } else if (ct < diveEnd) {
      if (mon.pose !== 'dive') {
        mon.pose = 'dive';
        mon.diveFrom = mon.x;
        Sound.swipe();
      }
      const u = (ct - T.dive) / T.diveDur;
      mon.x = lerp(mon.diveFrom, victim.x - REACH, u);
      mon.y = victim.y - Math.round(Math.sin(u * Math.PI) * 16);
    } else if (!victim.caught) {
      impact();
    } else if (ct >= T.triumph && mon.pose === 'dive') {
      mon.pose = 'triumph';
      mon.x = Math.round(mon.x + 12);
      mon.y = victim.y;
      shake = 4;
      dust(mon.x + 32, mon.y, 14);
      Sound.roar();
      lightning(true);
    }

    if (mode === 'chase' && ct >= T.verdict) {
      mode = 'verdict';
      mt = 0;
      Sound.bell();
      if (hooks.onVerdict) hooks.onVerdict();
    }
  }

  function impact() {
    victim.caught = true;
    mon.x = victim.x - REACH;
    mon.y = victim.y;
    shake = 6;
    dust(victim.x + 6, victim.y, 30);
    Sound.stopMusic();
    Sound.thump();
    Sound.scream();
    for (const r of runners) {
      if (r !== victim) {
        r.exiting = true;
        r.exitV = 80;
      }
    }
    if (hooks.onCatch) hooks.onCatch();
  }

  function updateRunners(dt) {
    const moving = mode !== 'idle' && !(mode === 'chase' && ct < 0.15);
    for (const r of runners) {
      if (r.caught || r.frozen) continue;
      if (moving) r.anim += dt * 11;
      if (r.exiting) {
        r.exitV += 260 * dt;
        r.offset += r.exitV * dt;
      } else if (mode === 'chase') {
        r.offset = chaseOffset(r);
      }
      const wobble = moving && !r.exiting ? Math.sin(time * r.speed + r.phase) * 6 : 0;
      r.x = Math.round(r.homeX + r.offset + wobble);
    }
  }

  // How far a villager drops back towards the monster: the victim for good, others briefly as a tease.
  function chaseOffset(r) {
    const nearMonster = mon.x + REACH - r.homeX;
    if (r === victim) {
      if (ct >= T.dive) {
        r.frozen = true;
        return r.offset;
      }
      return lerp(0, nearMonster, ease(clamp01((ct - T.fall) / (T.dive - T.fall))));
    }
    const tz = teases.find(z => z.who === r);
    if (!tz) return 0;
    const k = ct - tz.t;
    if (k < 0 || k > 1.4) return 0;
    if (k < 0.5) return lerp(0, nearMonster + 6, ease(k / 0.5));
    if (k < 0.8) return nearMonster + 6;
    return lerp(nearMonster + 6, 0, ease((k - 0.8) / 0.6));
  }

  function updateRelease(dt) {
    const f = freed;
    f.anim += dt * 12;
    if (!f.landed) {
      f.vy += 520 * dt;
      f.y += f.vy * dt;
      if (f.y >= mon.y) {
        f.y = mon.y;
        f.landed = true;
        dust(f.x + 6, f.y, 8);
      }
    } else {
      f.x += 170 * dt;
    }
    if (mt > 1.6 && hooks.onDone) {
      const done = hooks.onDone;
      hooks.onDone = null;
      done();
    }
  }

  function dust(x, y, n) {
    const cols = ['#4a3a48', '#5e4c58', '#3a2c38', '#6e5c64'];
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 10, y: y - Math.random() * 4, floor: y,
        vx: (Math.random() - 0.5) * 110, vy: -Math.random() * 60,
        life: 0.5 + Math.random() * 0.7, age: 0, size: 1 + Math.floor(Math.random() * 3), col: cols[i % cols.length],
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.age += dt;
      p.vy += 90 * dt;
      p.vx *= 1 - 2 * dt;
      p.x += (p.vx - camSpeed) * dt;
      p.y = Math.min(p.floor, p.y + p.vy * dt);
    }
    particles = particles.filter(p => p.age < p.life);
  }

  function newBat(delay) {
    return { x: -10, y: 0, base: 30 + Math.random() * 90, vx: 28 + Math.random() * 22, phase: Math.random() * 6, delay };
  }

  function updateBat(b, dt) {
    if (b.delay > 0) {
      b.delay -= dt;
      return;
    }
    b.x += b.vx * dt;
    b.y = b.base + Math.sin(time * 2.5 + b.phase) * 6;
    if (b.x > W + 10) Object.assign(b, newBat(4 + Math.random() * 16));
  }

  function lightning(big) {
    let x = 30 + Math.random() * 420, y = 0;
    const pts = [[x, y]];
    while (y < 120) {
      y += 6 + Math.random() * 10;
      x += (Math.random() - 0.5) * 20;
      pts.push([Math.round(x), Math.round(y)]);
    }
    bolt = { pts, life: 0.22 };
    flash = big ? 0.9 : 0.55;
    Sound.thunder(big ? 0.1 : 0.4 + Math.random() * 0.8);
  }

  function fadeTo(cb) {
    fadeCb = cb;
    fadeDir = 1;
  }

  function updateFade(dt) {
    if (fadeDir > 0) {
      fade = Math.min(1, fade + dt / 0.35);
      if (fade >= 1) {
        fadeDir = -1;
        const cb = fadeCb;
        fadeCb = null;
        if (cb) cb();
      }
    } else if (fadeDir < 0) {
      fade = Math.max(0, fade - dt / 0.35);
      if (fade <= 0) fadeDir = 0;
    }
  }

  // ---------------------------------------------------------------- render

  function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * shake * 2), Math.round((Math.random() - 0.5) * shake * 2));
    Scene.drawSky(ctx, time);
    if (bolt) drawBolt();
    Scene.drawBehind(ctx, cam, time, () => {
      drawBats();
      if (mode === 'idle' && runners.length) drawLurkingEyes();
    });
    drawActors();
    drawParticles();
    drawGlows();
    Scene.drawFront(ctx, cam, time);
    Scene.drawVignette(ctx);
    drawLabels();
    drawOverlay();
    ctx.restore();
    if (flash > 0) {
      ctx.fillStyle = `rgba(215,205,255,${(flash * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBolt() {
    for (let i = 1; i < bolt.pts.length; i++) {
      const [x0, y0] = bolt.pts[i - 1], [x1, y1] = bolt.pts[i];
      Art.line(ctx, x0, y0, x1, y1, 3, 'rgba(170,150,255,0.35)');
    }
    for (let i = 1; i < bolt.pts.length; i++) {
      const [x0, y0] = bolt.pts[i - 1], [x1, y1] = bolt.pts[i];
      Art.line(ctx, x0, y0, x1, y1, 1, '#f2ecff');
    }
  }

  function drawBats() {
    for (const b of bats) {
      if (b.delay > 0) continue;
      ctx.drawImage(Art.bats[Math.floor(time * 8 + b.phase) % 2], Math.round(b.x), Math.round(b.y));
    }
  }

  // Before the hunt, something watches from the dead woods...
  function drawLurkingEyes() {
    if (time % 5 < 0.18) return;
    ctx.fillStyle = '#ff3a22';
    ctx.fillRect(62, 184, 2, 1);
    ctx.fillRect(68, 184, 2, 1);
  }

  function shadow(x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(Math.round(x), y - 1, w, 2);
  }

  function drawActors() {
    const list = [];
    for (const r of runners) {
      if (!r.caught && r.x > -20 && r.x < W + 20) list.push([r.y, () => drawVillager(r)]);
    }
    if (mon.pose !== 'hidden') list.push([mon.y + 0.1, drawMonster]);
    if (freed) list.push([freed.y + 0.2, drawFreed]);
    list.sort((a, b) => a[0] - b[0]);
    for (const [, draw] of list) draw();
  }

  function drawVillager(r) {
    const s = Art.villager(r.style);
    let img = s.idle, bob = 0;
    if (mode !== 'idle' && !(mode === 'chase' && ct < 0.15)) {
      const f = Math.floor(r.anim) % 4;
      img = s.run[f];
      bob = f % 2 ? -1 : 0;
    } else if (Math.sin(time * 1.7 + r.phase) > 0.85) {
      bob = -1;
    }
    shadow(r.x + 1, r.y, 10);
    ctx.drawImage(img, r.x, r.y - 18 + bob);
  }

  function drawMonster() {
    const S = Art.monster();
    const x = Math.round(mon.x + mon.lunge);
    const img = mon.pose === 'run' ? S.run[Math.floor(time * 9) % 4] : S[mon.pose];
    const w = img.width * MS, h = img.height * MS;
    const bob = mon.pose === 'triumph' ? (Math.floor(time * 4) % 2) * MS : 0;
    const top = mon.y - h + bob;
    shadow(x + 6, mon.pose === 'dive' ? victim.y : mon.y, w - 12);
    ctx.drawImage(img, x, top, w, h);
    const eyes = S.eyes[mon.pose];
    mon.eyes = eyes ? [x + eyes[0] * MS + 1, top + eyes[1] * MS] : null;
    if (mon.pose === 'triumph' && victim) {
      // Held aloft in the raised fist, kicking.
      ctx.drawImage(Art.villager(victim.style).held[Math.floor(time * 7) % 2], x + 9, top - 10);
    }
  }

  function drawFreed() {
    const img = Art.villager(freed.style).flee[Math.floor(freed.anim) % 4];
    if (freed.landed) shadow(freed.x + 1, freed.y, 10);
    ctx.drawImage(img, Math.round(freed.x), Math.round(freed.y) - 18);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // Lantern light and the monster's eyes, added on top of the scene.
  function drawGlows() {
    ctx.globalCompositeOperation = 'lighter';
    for (const r of runners) {
      if (r.caught || r.x < -40 || r.x > W + 40) continue;
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 13 + r.phase * 3) * Math.sin(time * 7.3 + r.phase);
      ctx.drawImage(Art.glow, r.x + 10 - 24, r.y - 8 - 24);
    }
    if (mon.pose !== 'hidden' && mon.eyes) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(Art.eyeGlow, mon.eyes[0] - 8, mon.eyes[1] - 8);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawLabels() {
    for (const r of runners) {
      if (r.caught || r.x < -40 || r.x > W + 10) continue;
      const img = Art.label(r.label, '#f3e6c4');
      ctx.drawImage(img, Math.round(r.x + 6 - img.width / 2), r.y - 19 - img.height);
    }
    if (freed) {
      const img = Art.label(freed.label, '#9fe8a8');
      ctx.drawImage(img, Math.round(freed.x + 6 - img.width / 2), Math.round(freed.y) - 19 - img.height);
    }
  }

  function centered(text, y, scale, col, outline) {
    const img = Art.label(text, col, outline, scale);
    ctx.drawImage(img, Math.round((W - img.width) / 2), y);
  }

  function drawOverlay() {
    if (mode === 'idle' && info) {
      centered(info.title, 22, 2, '#d9b25a');
      if (info.subtitle) centered(info.subtitle, 42, 1, '#e9dfc4');
    }
    if (mode === 'chase' && ct < 1.3 && Math.floor(ct * 6) % 2 === 0) centered('RUN!', 40, 5, '#ff4a3a');
    if (mode === 'verdict') drawVerdict();
  }

  function frame(x, y, w, h, t) {
    ctx.fillRect(x, y, w, t);
    ctx.fillRect(x, y + h - t, w, t);
    ctx.fillRect(x, y, t, h);
    ctx.fillRect(x + w - t, y, t, h);
  }

  function drawVerdict() {
    ctx.globalAlpha = clamp01(mt / 0.5);
    const name = Art.glyphs(victim.name).slice(0, 24);
    let scale = 4;
    while (scale > 1 && Art.textWidth(name, scale) > 290) scale--;
    const bw = 320, bh = 56 + 7 * scale, bx = (W - bw) / 2, by = 12;
    ctx.fillStyle = 'rgba(8,3,12,0.9)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#6a1222';
    frame(bx, by, bw, bh, 2);
    ctx.fillStyle = '#c9a227';
    frame(bx + 4, by + 4, bw - 8, bh - 8, 1);
    for (const [cx, cy] of [[bx + 2, by + 2], [bx + bw - 6, by + 2], [bx + 2, by + bh - 6], [bx + bw - 6, by + bh - 6]]) {
      ctx.fillRect(cx, cy, 4, 4);
    }
    centered('THE SCRUM MONSTER HAS CHOSEN', by + 10, 2, '#c9a227');
    centered(name, by + 28, scale, Math.floor(time * 3) % 2 ? '#ff5a3c' : '#ff8a4a', '#2a0505');
    centered("TO RUN NEXT WEEK'S STANDUP", by + 34 + 7 * scale, 2, '#e9dfc4');
    ctx.globalAlpha = 1;
  }

  return { init, showIdle, returnToIdle, chase, release };
})();
