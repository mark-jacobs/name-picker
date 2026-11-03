'use strict';
/*
 * Chiptune music and sound effects, synthesised with the Web Audio API (no audio files).
 * Browsers only allow audio after a click or key press, so nothing plays until unlock() is called.
 */
const Sound = (() => {
  const VOLUME = 0.8;
  let ctx = null, master, musicBus, sfxBus, noiseBuf, distortion;
  let muted = false;
  let wanted = null; // the song that should be playing once audio is unlocked
  let song = null;

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.35;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      distortion = new Float32Array(1024).map((_, i) => Math.tanh(((i / 1023) * 2 - 1) * 6));
      if (wanted) startSong(wanted);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(value) {
    muted = value;
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- building blocks

  function tone({ type = 'square', freq, endFreq, start, dur, vol = 0.2, attack = 0.005, release = 0.04, dest = sfxBus, vibrato = 0, vibratoRate = 5.5 }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + attack);
    g.gain.setValueAtTime(vol, Math.max(start + attack, start + dur - release));
    g.gain.linearRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest);
    if (vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = vibratoRate;
      depth.gain.value = vibrato;
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(start);
      lfo.stop(start + dur + 0.05);
    }
    o.start(start);
    o.stop(start + dur + 0.05);
    return o;
  }

  function noise({ start, dur, vol = 0.3, filter = 'lowpass', freq = 1000, endFreq, q = 1, attack = 0.005, dest = sfxBus }) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    src.loop = true;
    f.type = filter;
    f.frequency.setValueAtTime(freq, start);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    f.Q.value = q;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(start, Math.random() * 1.5);
    src.stop(start + dur + 0.05);
  }

  // ---------------------------------------------------------------- music

  // D minor: Dm - Bb - C - A
  const ROOTS = [38, 34, 36, 33];
  const CHORDS = [[62, 65, 69, 74], [58, 62, 65, 70], [60, 64, 67, 72], [57, 61, 64, 69]];
  // A slow graveyard dirge: -1 holds the previous note, 0 is a rest.
  const DIRGE = [62, -1, 65, -1, 69, -1, 67, 65, 65, -1, -1, -1, 62, -1, -1, -1, 64, -1, 67, -1, 65, 64, 62, -1, 61, -1, -1, -1, -1, -1, 0, 0];
  const BASS_GALLOP = [0, null, 0, 12, 0, null, 0, 12, 0, null, 0, 12, 0, 0, 12, 12];
  const ARPEGGIO = [2, 1, 0, 1, 2, 1, 0, 1, 3, 2, 1, 2, 3, 2, 1, 2];

  const SONGS = {
    idle: {
      step: 0.42,
      play(i, t, sd, bus) {
        const r = ROOTS[Math.floor(i / 8) % 4];
        if (i % 8 === 0) {
          tone({ type: 'square', freq: midi(r), start: t, dur: sd * 8, vol: 0.09, attack: 0.3, release: 0.6, dest: bus });
          tone({ type: 'triangle', freq: midi(r + 12), start: t, dur: sd * 8, vol: 0.12, attack: 0.4, release: 0.8, dest: bus });
          tone({ type: 'triangle', freq: midi(r + 19), start: t, dur: sd * 8, vol: 0.07, attack: 0.6, release: 0.8, dest: bus });
        }
        const n = DIRGE[i % DIRGE.length];
        if (n > 0) {
          let len = 1;
          while (len < 8 && DIRGE[(i + len) % DIRGE.length] === -1) len++;
          tone({ type: 'square', freq: midi(n + 12), start: t, dur: sd * len * 0.95, vol: 0.045, attack: 0.02, release: 0.2, dest: bus, vibrato: 5 });
        }
      },
    },
    chase: {
      step: 0.105,
      play(i, t, sd, bus) {
        const bar = Math.floor(i / 16) % 4, s = i % 16;
        const bass = BASS_GALLOP[s];
        if (bass !== null) tone({ type: 'square', freq: midi(ROOTS[bar] + bass), start: t, dur: sd * 0.8, vol: 0.12, dest: bus });
        tone({ type: 'square', freq: midi(CHORDS[bar][ARPEGGIO[s]] + 12), start: t, dur: sd * 0.7, vol: 0.045, dest: bus });
        if (s % 8 === 0) tone({ type: 'sine', freq: 150, endFreq: 45, start: t, dur: 0.14, vol: 0.55, dest: bus });
        if (s % 8 === 4) noise({ start: t, dur: 0.12, vol: 0.22, filter: 'bandpass', freq: 1800, q: 0.7, dest: bus });
        if (s % 2 === 1) noise({ start: t, dur: 0.03, vol: 0.06, filter: 'highpass', freq: 7000, dest: bus });
      },
    },
  };

  function startSong(name) {
    const def = SONGS[name];
    const bus = ctx.createGain();
    bus.connect(musicBus);
    const s = { name, def, bus, step: 0, next: ctx.currentTime + 0.06 };
    s.timer = setInterval(() => {
      // After the tab was in the background, skip ahead rather than playing a burst of late notes.
      if (s.next < ctx.currentTime - 0.2) s.next = ctx.currentTime + 0.05;
      while (s.next < ctx.currentTime + 0.15) {
        def.play(s.step, s.next, def.step, bus);
        s.next += def.step;
        s.step++;
      }
    }, 25);
    song = s;
  }

  function stopSong() {
    if (!song) return;
    clearInterval(song.timer);
    const bus = song.bus;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => bus.disconnect(), 1500);
    song = null;
  }

  function playMusic(name) {
    wanted = name;
    if (!ctx || (song && song.name === name)) return;
    stopSong();
    if (name) startSong(name);
  }

  // ---------------------------------------------------------------- sound effects

  const now = () => (ctx ? ctx.currentTime : null);

  // The referee's whistle that starts the chase.
  function whistle() {
    const t = now();
    if (t === null) return;
    for (const [delay, len] of [[0, 0.13], [0.2, 0.55]]) {
      tone({ type: 'sine', freq: 2900, start: t + delay, dur: len, vol: 0.1, attack: 0.01, release: 0.03, vibrato: 160, vibratoRate: 32 });
    }
  }

  function roar() {
    const t = now();
    if (t === null) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(65, t);
    o.frequency.linearRampToValueAtTime(100, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(42, t + 1.8);
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 26;
    depth.gain.value = 20;
    lfo.connect(depth);
    depth.connect(o.frequency);
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortion;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.12);
    g.gain.setValueAtTime(0.45, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    o.connect(shaper);
    shaper.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 2);
    lfo.stop(t + 2);
    noise({ start: t, dur: 1.8, vol: 0.3, filter: 'bandpass', freq: 700, endFreq: 250, q: 0.9, attack: 0.12 });
    tone({ type: 'square', freq: 48, endFreq: 34, start: t, dur: 1.8, vol: 0.13, attack: 0.1, release: 0.6 });
  }

  // The rugby tackle landing.
  function thump() {
    const t = now();
    if (t === null) return;
    tone({ type: 'sine', freq: 160, endFreq: 38, start: t, dur: 0.35, vol: 0.9 });
    noise({ start: t, dur: 0.3, vol: 0.5, filter: 'lowpass', freq: 700 });
  }

  function scream() {
    const t = now();
    if (t === null) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(650, t);
    o.frequency.linearRampToValueAtTime(1350, t + 0.12);
    o.frequency.linearRampToValueAtTime(1100, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.7);
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 14;
    depth.gain.value = 60;
    lfo.connect(depth);
    depth.connect(o.frequency);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.8);
    lfo.stop(t + 0.8);
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.77);
    o.connect(f);
    f.connect(g);
    g.connect(sfxBus);
  }

  function swipe() {
    const t = now();
    if (t === null) return;
    noise({ start: t, dur: 0.25, vol: 0.35, filter: 'bandpass', freq: 3200, endFreq: 500, q: 1.5, attack: 0.01 });
  }

  // A relieved squeak as a spared villager escapes.
  function yelp() {
    const t = now();
    if (t === null) return;
    tone({ type: 'square', freq: 520, endFreq: 980, start: t, dur: 0.16, vol: 0.08 });
    tone({ type: 'square', freq: 700, endFreq: 1200, start: t + 0.18, dur: 0.14, vol: 0.07 });
  }

  function thunder(delay = 0) {
    const t = now();
    if (t === null) return;
    const s = t + delay;
    noise({ start: s, dur: 0.18, vol: 0.22, filter: 'highpass', freq: 1500 });
    noise({ start: s, dur: 3.0, vol: 0.65, filter: 'lowpass', freq: 420, endFreq: 90, attack: 0.05 });
    noise({ start: s + 0.25, dur: 2.2, vol: 0.4, filter: 'lowpass', freq: 200, endFreq: 60, attack: 0.2 });
  }

  // A church bell tolling twice for the chosen one.
  function bell() {
    const t = now();
    if (t === null) return;
    for (const at of [t, t + 2.2]) {
      for (const [ratio, vol, decay] of [[1, 0.25, 4], [2, 0.15, 3], [2.4, 0.1, 2.5], [3, 0.08, 2], [4.2, 0.06, 1.5], [5.4, 0.05, 1.2]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 146.83 * ratio;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(vol, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        o.connect(g);
        g.connect(sfxBus);
        o.start(at);
        o.stop(at + decay + 0.05);
      }
    }
  }

  return {
    unlock, setMuted, playMusic, stopMusic: () => playMusic(null),
    whistle, roar, thump, scream, swipe, yelp, thunder, bell,
  };
})();
