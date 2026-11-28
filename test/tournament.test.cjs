'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { Tournament, THREE_HOURS } = require('../tournament.cjs');
class MemoryStore {
  documents = new Map();
  async read(id) {
    return this.documents.get(id) || { id, revision: 0, value: null };
  }
  async save(changes) {
    if (
      changes.some(
        ([d]) => (this.documents.get(d.id)?.revision || 0) !== d.revision,
      )
    )
      return false;
    for (const [d, value] of changes)
      this.documents.set(d.id, {
        id: d.id,
        revision: d.revision + 1,
        value: structuredClone(value),
      });
    return true;
  }
}
const player = (i) => ({ id: 'p' + i, nick: 'Player' + i, organizer: i === 0 });
async function setup(count) {
  const db = new MemoryStore();
  let time = 100000;
  const now = () => time,
    cup = new Tournament(db, now);
  for (let i = 0; i < count; i++) await cup.handle('register', null, player(i));
  return { cup, db, now, tick: (ms) => (time += ms) };
}
const user = (id) => player(Number(id.slice(1)));
const view = async (cup) => (await cup.handle('view', null, null)).tournament;
async function enter(cup, m) {
  const id = m.id + '-' + m.number,
    seats = m.number % 2 ? [...m.players] : [...m.players].reverse();
  const w = user(seats[0]),
    b = user(seats[1]);
  const first = await cup.handle('enter', id, w, { stand: 'crimson' });
  assert.equal(first.ready, false);
  const second = await cup.handle('enter', id, b);
  const state = await choose(cup, id, w, b, second);
  assert.equal(state.ready, true);
  return { id, w, b, state };
}
async function choose(
  cup,
  id,
  w,
  b,
  state,
  white = 'crimson',
  black = 'world',
) {
  while (!state.ready) {
    const { step, side } = state.lobby;
    const stand =
      step === 'ban'
        ? side === 'w'
          ? 'gold'
          : 'heaven'
        : side === 'w'
          ? white
          : black;
    state = await cup.handle(step, id, side === 'w' ? w : b, { stand });
  }
  return state;
}
test('only the organizer seeds a public bracket and byes advance exactly once', async () => {
  const { cup } = await setup(5);
  await cup.handle('register', null, player(3));
  await cup.handle('withdraw', null, player(4));
  await cup.handle('register', null, player(4));
  assert.equal((await view(cup)).rounds.length, 0);
  await assert.rejects(cup.handle('start', null, player(1)), { status: 403 });
  await cup.handle('start', null, player(0));
  const t = await view(cup);
  assert.deepEqual(
    t.rounds.map((r) => r.length),
    [4, 2, 1],
  );
  assert.equal(t.rounds[0].filter((m) => m.winner).length, 3);
  assert.equal(
    new Set(t.rounds[0].flatMap((m) => m.players.filter(Boolean))).size,
    5,
  );
  assert.equal(t.rounds[0][0].target, 2);
  assert.equal(t.rounds.at(-1)[0].target, 3);
  await assert.rejects(cup.handle('register', null, player(8)), {
    status: 409,
  });
});
test('clocks start on two live seats, survive restart and charge only the actual moving side', async () => {
  const { cup, db, now, tick } = await setup(2);
  await cup.handle('start', null, player(0));
  const m = (await view(cup)).rounds[0][0],
    id = m.id + '-1',
    w = user(m.players[0]),
    b = user(m.players[1]);
  await assert.rejects(
    cup.handle('enter', id, player(33), { stand: 'world' }),
    { status: 403 },
  );
  await cup.handle('enter', id, w, { stand: 'crimson' });
  tick(THREE_HOURS * 2);
  let data = await cup.handle('enter', id, b, { stand: 'world' });
  assert.equal(data.clock.running, null);
  data = await cup.handle('poll', id, w);
  assert.deepEqual(data.clock.left, { w: THREE_HOURS, b: THREE_HOURS });
  data = await choose(cup, id, w, b, data);
  tick(900);
  data = await cup.handle('action', id, w, {
    type: 'move',
    from: 'e2',
    to: 'e4',
    version: data.version,
  });
  assert.equal(data.clock.running, 'b');
  assert.equal(data.clock.left.w, THREE_HOURS - 900);
  const restored = new Tournament(db, now);
  tick(2000);
  const resumed = await restored.handle('enter', id, b, { stand: 'gold' });
  assert.equal(resumed.state.fen, data.state.fen);
  assert.equal(resumed.state.stands.b, 'world');
  assert.equal(resumed.clock.left.b, THREE_HOURS - 2000);
  tick(THREE_HOURS);
  const bracket = await view(restored);
  assert.deepEqual(bracket.rounds[0][0].wins, [1, 0]);
  const done = await restored.handle('poll', id, b);
  assert.equal(done.clock.ended.winner, 'w');
  assert.equal(done.clock.left.b, 0);
  await assert.rejects(
    restored.handle('action', id, b, {
      type: 'move',
      from: 'e7',
      to: 'e5',
      version: done.version,
    }),
    { status: 409 },
  );
});
test('a drawn game reverses colours without scoring; checkmate scores once and the final ends at three wins', async () => {
  const { cup, tick } = await setup(2);
  await cup.handle('start', null, player(0));
  let m = (await view(cup)).rounds[0][0];
  let { id, w, b, state } = await enter(cup, m);
  for (let i = 0; i < 16 && !state.clock.ended; i++)
    for (const [who, from, to] of [
      [w, 'g1', 'f3'],
      [b, 'g8', 'f6'],
      [w, 'f3', 'g1'],
      [b, 'f6', 'g8'],
    ]) {
      state = await cup.handle('action', id, who, {
        type: 'move',
        from,
        to,
        version: state.version,
      });
      if (state.clock.ended) break;
    }
  assert.equal(state.clock.ended.winner, null);
  m = (await view(cup)).rounds[0][0];
  assert.deepEqual(m.wins, [0, 0]);
  assert.equal(m.number, 2);
  const second = await enter(cup, m);
  assert.equal(second.w.id, b.id);
  let last = second.state;
  for (const [who, from, to] of [
    [second.w, 'f2', 'f3'],
    [second.b, 'e7', 'e5'],
    [second.w, 'g2', 'g4'],
    [second.b, 'd8', 'h4'],
  ]) {
    last = await cup.handle('action', second.id, who, {
      type: 'move',
      from,
      to,
      version: last.version,
    });
  }
  assert.equal(last.clock.ended.winner, 'b');
  const winner = second.b.id;
  for (let n = 0; n < 2; n++) {
    m = (await view(cup)).rounds[0][0];
    const turn = await enter(cup, m);
    if (turn.w.id === winner)
      await cup.handle('action', turn.id, turn.w, {
        type: 'move',
        from: 'e2',
        to: 'e4',
        version: turn.state.version,
      });
    tick(THREE_HOURS + 1);
    await view(cup);
  }
  const result = await view(cup);
  assert.equal(result.champion, winner);
  assert.equal(result.phase, 'finished');
});
test('semifinal winner advances after exactly two wins and a stale submit is rejected', async () => {
  const { cup, tick } = await setup(4);
  await cup.handle('start', null, player(0));
  const initial = (await view(cup)).rounds[0][0],
    winner = initial.players[1];
  for (let i = 0; i < 2; i++) {
    const m = (await view(cup)).rounds[0][0],
      g = await enter(cup, m);
    if (g.w.id === winner) {
      const move = {
        type: 'move',
        from: 'e2',
        to: 'e4',
        version: g.state.version,
      };
      await cup.handle('action', g.id, g.w, move);
      await assert.rejects(cup.handle('action', g.id, g.w, move), {
        status: 409,
      });
    }
    tick(THREE_HOURS);
    await view(cup);
  }
  const t = await view(cup);
  assert.equal(t.rounds[0][0].winner, winner);
  assert.equal(t.rounds[1][0].players[0], winner);
});
test('The World keeps the same tournament clock running through the first extra move', async () => {
  const { cup, db, tick, now } = await setup(2);
  await cup.handle('start', null, player(0));
  const m = (await view(cup)).rounds[0][0],
    id = m.id + '-1';
  const w = user(m.players[0]),
    b = user(m.players[1]);
  await cup.handle('enter', id, w, { stand: 'world' });
  await cup.handle('enter', id, b, { stand: 'crimson' });
  await choose(
    cup,
    id,
    w,
    b,
    await cup.handle('poll', id, w),
    'world',
    'crimson',
  );
  const record = await db.read(id);
  const seeded = structuredClone(record.value);
  seeded.initial.mana.w = 100;
  await db.save([[record, seeded]]);
  const restored = new Tournament(db, now);
  let data = await restored.handle('poll', id, w);
  for (const action of [
    { type: 'ability' },
    { type: 'move', from: 'e2', to: 'e4' },
    { type: 'move', from: 'g1', to: 'f3' },
  ]) {
    assert.equal(data.clock.running, 'w');
    tick(1000);
    data = await restored.handle('action', id, w, {
      ...action,
      version: data.version,
    });
  }
  assert.equal(data.clock.running, 'b');
  assert.deepEqual(data.clock.left, { w: THREE_HOURS - 3000, b: THREE_HOURS });
});

test('leaving ends just this game and repeated exits award one point', async () => {
  const { cup } = await setup(2);
  await cup.handle('start', null, player(0));
  const match = (await view(cup)).rounds[0][0];
  const white = user(match.players[0]),
    black = user(match.players[1]);
  const id = match.id + '-1';
  await cup.handle('enter', id, white, { stand: 'world' });
  await assert.rejects(cup.handle('leave', id, player(3)), { status: 403 });
  await cup.handle('enter', id, black, { stand: 'crimson' });
  await Promise.all([
    cup.handle('leave', id, white),
    cup.handle('leave', id, white),
  ]);
  const closed = await cup.handle('poll', id, black);
  assert.deepEqual(closed.clock.ended, { reason: 'resign', winner: 'b' });
  assert.equal(closed.clock.running, null);
  assert.deepEqual(closed.series.score, [0, 1]);
  const nextId = match.id + '-2';
  await cup.handle('enter', nextId, black, { stand: 'world' });
  await cup.handle('leave', nextId, black);
  const waiting = await cup.handle('enter', nextId, white, { stand: 'world' });
  assert.equal(waiting.clock.running, null);
  assert.equal(waiting.clock.ended.reason, 'resign');
  assert.deepEqual(waiting.series.score, [1, 1]);
});

test('slots keep their position on expansion, collisions are atomic and only the first unfinished pair opens', async () => {
  const { cup } = await setup(0);
  await cup.handle('register', null, player(0), { slot: 7 });
  const claims = await Promise.allSettled(
    [1, 2].map((i) => cup.handle('register', null, player(i), { slot: 0 })),
  );
  assert.equal(claims.filter((c) => c.status === 'fulfilled').length, 1);
  for (let i = 1; i < 9; i++) await cup.handle('register', null, player(i));
  const preview = await cup.handle('view', null, null);
  assert.equal(preview.registration.seeds.length, 16);
  assert.equal(preview.tournament.players.find((p) => p.id === 'p0').slot, 7);
  await cup.handle('start', null, player(0));
  const { tournament: t, active } = await cup.handle('view', null, null);
  const [first, next] = t.rounds
    .flat()
    .filter((m) => m.players.every(Boolean) && !m.winner);
  assert.equal(first.id, active);
  await assert.rejects(
    cup.handle('enter', next.id + '-1', user(next.players[0])),
    { status: 409 },
  );
  for (let n = 1; n <= 2; n++) {
    const id = first.id + '-' + n;
    await cup.handle('enter', id, user(first.players[0]));
    await cup.handle('leave', id, user(first.players[0]));
  }
  assert.equal((await cup.handle('view', null, null)).active, next.id);
});
test('draft clock follows the actor, bans survive color swaps and spectators cannot influence the clock', async () => {
  const { cup, tick } = await setup(2);
  await cup.handle('start', null, player(0));
  const m = (await view(cup)).rounds[0][0],
    id = m.id + '-1',
    w = user(m.players[0]),
    b = user(m.players[1]);
  await cup.handle('enter', id, w);
  tick(1000);
  assert.equal((await cup.handle('watch', id, null)).clock.running, null);
  await cup.handle('enter', id, b);
  tick(3000);
  await assert.rejects(cup.handle('pick', id, w, { stand: 'dust' }), {
    status: 409,
  });
  let data = await cup.handle('ban', id, w, { stand: 'gold' });
  assert.equal(data.clock.running, 'b');
  assert.equal(data.clock.left.w, THREE_HOURS - 3000);
  tick(1000);
  await cup.handle('ban', id, b, { stand: 'heaven' });
  await assert.rejects(cup.handle('pick', id, w, { stand: 'gold' }), {
    status: 422,
  });
  await cup.handle('pick', id, w, { stand: 'dust' });
  data = await cup.handle('pick', id, b, { stand: 'world' });
  assert.equal(data.clock.running, 'w');
  assert.equal(data.clock.left.b, THREE_HOURS - 1000);
  const seen = await cup.handle('watch', id, null);
  assert.equal(seen.board.pieces.length, 32);
  assert.equal(seen.state, undefined);
  await assert.rejects(cup.handle('action', id, null, { type: 'move' }), {
    status: 403,
  });
  await cup.handle('action', id, w, {
    type: 'move',
    from: 'e2',
    to: 'e4',
    version: data.version,
  });
  assert.ok(
    (await cup.handle('watch', id, null)).board.pieces.some(
      (p) => p.square === 'e4',
    ),
  );
  await cup.handle('leave', id, w);
  await cup.handle('enter', m.id + '-2', w);
  const next = await cup.handle('enter', m.id + '-2', b);
  assert.equal(next.lobby.step, 'pick');
  assert.deepEqual(next.lobby.bans, ['gold', 'heaven']);
});

test('a public broadcast hides secret arming and a new series has its own two bans', async () => {
  const { cup, db } = await setup(4);
  await cup.handle('start', null, player(0));
  const m = (await view(cup)).rounds[0][0],
    id = m.id + '-1',
    w = user(m.players[0]),
    b = user(m.players[1]);
  await cup.handle('enter', id, w);
  const opening = await cup.handle('enter', id, b);
  await choose(cup, id, w, b, opening, 'dust', 'world');
  const record = await db.read(id),
    seeded = structuredClone(record.value);
  seeded.initial.mana.w = 100;
  await db.save([[record, seeded]]);
  let state = await cup.handle('poll', id, w);
  const before = await cup.handle('watch', id, null);
  await cup.handle('action', id, w, {
    type: 'ability',
    target: 'e2',
    version: state.version,
  });
  assert.deepEqual(await cup.handle('watch', id, null), before);
  for (let n = 1; n <= 2; n++) {
    const gid = m.id + '-' + n;
    if (n === 2) await cup.handle('enter', gid, w);
    await cup.handle('leave', gid, w);
  }
  const next = (await view(cup)).rounds[0][1];
  const a = user(next.players[0]),
    c = user(next.players[1]);
  await cup.handle('enter', next.id + '-1', a);
  state = await cup.handle('enter', next.id + '-1', c);
  assert.deepEqual(state.lobby.bans, [null, null]);
  assert.equal(state.lobby.step, 'ban');
});
