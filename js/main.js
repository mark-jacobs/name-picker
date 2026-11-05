'use strict';
/*
 * Team state and page controls.
 *
 * Picking works like drawing names from a hat without putting them back: each round everyone is in
 * the pool, each pick removes one person, and when the pool is empty a new round refills it. So
 * everyone takes exactly one turn per round. The last person of one round can't open the next one,
 * so nobody runs two weeks in a row.
 */
(() => {
  const STORAGE_KEY = 'scrum-monster-picker.v1';
  const MUTE_KEY = 'scrum-monster-picker.muted';
  const XMAS_KEY = 'scrum-monster-picker.xmas';
  const MAX_NAME = 24;
  const $ = id => document.getElementById(id);
  const els = {
    stage: $('stage'), summon: $('summon'), spare: $('spare'), seal: $('seal'), mute: $('mute'), xmas: $('xmas'), status: $('status'),
    addForm: $('add-form'), addName: $('add-name'), addButton: $('add-button'),
    team: $('team-list'), teamEmpty: $('team-empty'), newRound: $('new-round'),
    graveyard: $('graveyard'), graveyardEmpty: $('graveyard-empty'), clearGraveyard: $('clear-graveyard'),
  };

  let storageOk = true;
  let state = load();
  let muted = loadFlag(MUTE_KEY);
  let xmasForced = loadFlag(XMAS_KEY); // the "Enable Xmas" switch, for trying it out before December
  let phase = 'idle';     // idle | chasing | verdict | releasing
  let spared = new Set(); // people spared during the current summoning
  let snapshot = null;    // state before the current pick, restored by "Spare them"
  let chosen = null;

  // ---------------------------------------------------------------- storage

  function emptyState() {
    return { team: [], pool: [], graveyard: [], round: 1 };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!raw || !Array.isArray(raw.team)) return emptyState();
      const team = raw.team.filter(n => typeof n === 'string' && n.trim());
      return {
        team,
        pool: (Array.isArray(raw.pool) ? raw.pool : []).filter(n => team.includes(n)),
        graveyard: (Array.isArray(raw.graveyard) ? raw.graveyard : []).filter(g => g && typeof g.name === 'string'),
        round: Number.isInteger(raw.round) && raw.round > 0 ? raw.round : 1,
      };
    } catch {
      return emptyState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch {
      storageOk = false;
    }
  }

  function loadFlag(key) {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  function saveFlag(key, value) {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch { /* not critical */ }
  }

  // ---------------------------------------------------------------- christmas

  const isDecember = () => new Date().getMonth() === 11;
  const xmasOn = () => isDecember() || xmasForced;

  function applyXmas() {
    const on = xmasOn();
    document.body.classList.toggle('xmas', on);
    Game.setXmas(on);
    Sound.setXmas(on);
  }

  const clone = s => JSON.parse(JSON.stringify(s));

  // ---------------------------------------------------------------- picking

  function randomInt(n) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n; // avoid modulo bias
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % n;
  }

  // The state as it will be at the moment of picking: an empty pool starts a new round.
  function readyForPick(s) {
    const next = clone(s);
    if (!next.pool.length) {
      next.pool = [...next.team];
      next.round += 1;
    }
    return next;
  }

  function candidates(s, exclude) {
    const pool = s.pool.filter(n => !exclude.has(n));
    const last = s.graveyard.length ? s.graveyard[s.graveyard.length - 1].name : null;
    const firstOfRound = !s.graveyard.some(g => g.round === s.round);
    if (firstOfRound && last && pool.length > 1) return pool.filter(n => n !== last);
    return pool;
  }

  function people(names) {
    return names.map(name => ({ name, style: Math.max(0, state.team.indexOf(name)) }));
  }

  function idleInfo() {
    const { team, pool, round } = state;
    if (!team.length) return { title: 'THE VILLAGE STANDS EMPTY', subtitle: 'ADD YOUR TEAM BELOW' };
    if (!pool.length) return { title: 'EVERY SOUL HAS FACED THE MONSTER', subtitle: `SUMMON IT TO BEGIN ROUND ${round + 1}` };
    const souls = pool.length === 1 ? 'SOUL STILL WANDERS' : 'SOULS STILL WANDER';
    return { title: `ROUND ${round}`, subtitle: `${pool.length} OF ${team.length} ${souls}` };
  }

  const idleView = () => ({ people: people(state.pool), info: idleInfo() });

  function refreshIdle() {
    if (phase !== 'idle') return;
    const view = idleView();
    Game.showIdle(view.people, view.info);
  }

  function summon() {
    if (!state.team.length || (phase !== 'idle' && phase !== 'releasing')) return;
    if (phase === 'idle') spared.clear();
    snapshot = clone(state);
    const next = readyForPick(state);
    const options = candidates(next, spared);
    if (!options.length) {
      phase = 'idle';
      spared.clear();
      Game.returnToIdle(idleView);
      render();
      return;
    }
    chosen = options[randomInt(options.length)];
    phase = 'chasing';
    render();
    Game.chase(people(next.pool.filter(n => !spared.has(n))), chosen, {
      onCatch() {
        next.pool = next.pool.filter(n => n !== chosen);
        next.graveyard.push({ name: chosen, at: new Date().toISOString(), round: next.round });
        state = next;
        save();
        render();
      },
      onVerdict() {
        phase = 'verdict';
        render();
      },
    });
  }

  function canSpare() {
    return !!snapshot && candidates(readyForPick(snapshot), new Set([...spared, chosen])).length > 0;
  }

  function spare() {
    if (phase !== 'verdict' || !canSpare()) return;
    spared.add(chosen);
    state = snapshot;
    save();
    phase = 'releasing';
    render();
    Game.release(summon);
  }

  function seal() {
    if (phase !== 'verdict') return;
    phase = 'idle';
    spared.clear();
    snapshot = null;
    Game.returnToIdle(idleView);
    render();
  }

  // ---------------------------------------------------------------- editing the team

  function addPeople(text) {
    const names = text.split(',').map(n => n.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)).filter(Boolean);
    for (const name of names) {
      if (state.team.some(t => t.toLowerCase() === name.toLowerCase())) continue;
      state.team.push(name);
      state.pool.push(name); // newcomers join the current round
    }
    save();
    refreshIdle();
    render();
  }

  function removePerson(name) {
    if (phase !== 'idle') return;
    if (!confirm(`Banish ${name} from the village? Their graves stay in the graveyard.`)) return;
    state.team = state.team.filter(n => n !== name);
    state.pool = state.pool.filter(n => n !== name);
    save();
    refreshIdle();
    render();
  }

  function newRound() {
    if (phase !== 'idle' || !state.team.length) return;
    if (!confirm('Return every soul to the village and start a new round?')) return;
    state.pool = [...state.team];
    state.round += 1;
    save();
    refreshIdle();
    render();
  }

  function clearGraveyard() {
    if (phase !== 'idle' || !state.graveyard.length) return;
    if (!confirm('Clear the graveyard? The list of past picks will be forgotten (the current round is unaffected).')) return;
    state.graveyard = [];
    save();
    render();
  }

  // ---------------------------------------------------------------- rendering

  function statusText() {
    const sparedNote = spared.size ? ` (Spared: ${[...spared].join(', ')})` : '';
    if (!storageOk) return 'Warning: this browser is not saving, so the list will be forgotten when the page closes.';
    if (phase === 'chasing') return `The monster hunts…${sparedNote}`;
    if (phase === 'verdict') return `${chosen} will run next week's standup.${sparedNote}`;
    if (phase === 'releasing') return `${chosen} is spared! The monster hunts again…`;
    if (!state.team.length) return 'Add your team to begin.';
    if (!state.pool.length) return `Round ${state.round} is complete: everyone has had a turn.`;
    return `Round ${state.round}: ${state.pool.length} of ${state.team.length} still to face the monster.`;
  }

  function render() {
    const idle = phase === 'idle', verdict = phase === 'verdict';
    els.summon.hidden = verdict;
    els.summon.disabled = !idle || !state.team.length;
    els.summon.textContent = state.team.length && !state.pool.length ? 'Summon the Scrum Monster (new round)' : 'Summon the Scrum Monster';
    els.spare.hidden = !verdict;
    els.seal.hidden = !verdict;
    if (verdict) {
      const ok = canSpare();
      els.spare.disabled = !ok;
      els.spare.title = ok ? `Put ${chosen} back and choose again` : 'No one else is left to choose this round';
    }
    els.mute.textContent = muted ? 'Sound: off' : 'Sound: on';
    els.mute.setAttribute('aria-pressed', String(muted));
    els.xmas.checked = xmasOn();
    els.xmas.disabled = isDecember();
    els.xmas.parentElement.title = isDecember() ? "It's December, so Christmas is on automatically" : 'Try out the Christmas theme early';
    els.status.textContent = statusText();
    els.addName.disabled = !idle;
    els.addButton.disabled = !idle;
    els.newRound.disabled = !idle || !state.team.length || state.pool.length === state.team.length;
    els.clearGraveyard.disabled = !idle || !state.graveyard.length;
    renderTeam(idle);
    renderGraveyard();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderTeam(editable) {
    els.team.replaceChildren(...state.team.map(name => {
      const waiting = state.pool.includes(name);
      const li = el('li', waiting ? 'waiting' : 'taken');
      const lamp = el('span', 'lamp');
      lamp.title = waiting ? 'Still to be chosen this round' : 'Already chosen this round';
      const remove = el('button', 'btn-x', '✕');
      remove.type = 'button';
      remove.title = `Remove ${name}`;
      remove.setAttribute('aria-label', `Remove ${name}`);
      remove.disabled = !editable;
      remove.addEventListener('click', () => removePerson(name));
      li.append(lamp, el('span', 'name', name), el('span', 'tag', waiting ? 'wandering' : 'taken'), remove);
      return li;
    }));
    els.teamEmpty.hidden = state.team.length > 0;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderGraveyard() {
    const graves = state.graveyard.map((g, i) => ({ ...g, n: i + 1 })).reverse();
    els.graveyard.replaceChildren(...graves.map((g, i) => {
      const li = el('li', 'tomb' + (i === 0 ? ' latest' : '') + (g.round < state.round ? ' old' : ''));
      li.append(
        el('span', 'num', `#${g.n}`),
        el('span', 'rip', 'R.I.P.'),
        el('span', 'who', g.name),
        el('span', 'when', formatDate(g.at)),
        el('span', 'round', `Round ${g.round}`),
      );
      return li;
    }));
    els.graveyardEmpty.hidden = graves.length > 0;
  }

  // ---------------------------------------------------------------- wiring

  // Browsers only allow sound after the first click or key press.
  window.addEventListener('pointerdown', Sound.unlock);
  window.addEventListener('keydown', Sound.unlock);

  els.summon.addEventListener('click', summon);
  els.spare.addEventListener('click', spare);
  els.seal.addEventListener('click', seal);
  els.newRound.addEventListener('click', newRound);
  els.clearGraveyard.addEventListener('click', clearGraveyard);
  els.mute.addEventListener('click', () => {
    muted = !muted;
    Sound.setMuted(muted);
    saveFlag(MUTE_KEY, muted);
    render();
  });
  els.xmas.addEventListener('change', () => {
    xmasForced = els.xmas.checked;
    saveFlag(XMAS_KEY, xmasForced);
    applyXmas();
    render();
  });
  els.addForm.addEventListener('submit', e => {
    e.preventDefault();
    if (phase !== 'idle' || !els.addName.value.trim()) return;
    addPeople(els.addName.value);
    els.addName.value = '';
    els.addName.focus();
  });

  Sound.setMuted(muted);
  Game.init(els.stage);
  applyXmas();
  refreshIdle();
  render();
})();
