'use strict';
const { randomInt, createHash } = require('node:crypto');
const { StandGame, STANDS } = require('./engine');
const {
  roomState,
  rememberDustPosition,
  playAction,
  seatVersion,
} = require('./room-game.cjs');
const { TournamentStore, fail } = require('./tournament-store.cjs');
const { identity } = require('./accounts.cjs');
const config = require('./assets/firebase.json');
const THREE_HOURS = 3 * 60 * 60 * 1000;
const other = (s) => (s === 'w' ? 'b' : 'w');
const empty = () => ({
  phase: 'registration',
  players: [],
  rounds: [],
  champion: null,
});
function advance(t) {
  for (let r = 0; r < t.rounds.length; r++) {
    for (const [i, m] of t.rounds[r].entries()) {
      if (r)
        m.players = [
          t.rounds[r - 1][i * 2].winner,
          t.rounds[r - 1][i * 2 + 1].winner,
        ];
      else if (!m.players[1] || !m.players[0])
        m.winner = m.players.find(Boolean);
    }
  }
  t.champion = t.rounds.at(-1)[0].winner;
  if (t.champion) t.phase = 'finished';
}
function start(t) {
  if (t.phase !== 'registration') throw fail(409, 'Турнир уже начался.');
  if (t.players.length < 2)
    throw fail(409, 'Для старта нужны минимум два участника.');
  const ids = t.players.map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  let seeds = [0, 1];
  while (seeds.length < ids.length) {
    const n = seeds.length * 2;
    seeds = seeds.flatMap((i) => [i, n - 1 - i]);
  }
  for (let count = seeds.length / 2, r = 0; count >= 1; count /= 2, r++) {
    t.rounds.push(
      Array.from({ length: count }, (_, i) => ({
        id: 'r' + (r + 1) + 'm' + (i + 1),
        players: r
          ? [null, null]
          : [ids[seeds[i * 2]] || null, ids[seeds[i * 2 + 1]] || null],
        wins: [0, 0],
        target: count === 1 ? 3 : 2,
        number: 1,
        winner: null,
        deadline: null,
      })),
    );
  }
  t.phase = 'playing';
  advance(t);
}
function conclude(t, m, g, reason, winner) {
  g.ended = { reason, winner };
  g.since = null;
  m.deadline = null;
  if (winner) {
    const index = m.players.indexOf(g.seats[winner]);
    m.wins[index]++;
    if (m.wins[index] === m.target) m.winner = m.players[index];
  }
  m.number++;
  advance(t);
}
function clockView(g, now) {
  const left = { ...g.left };
  if (g.since !== null)
    left[g.turn] = Math.max(0, left[g.turn] - Math.max(0, now - g.since));
  return {
    left,
    running: g.since === null ? null : g.turn,
    ended: g.ended,
    now,
  };
}
function seedGame(m) {
  const [w, b] = m.number % 2 ? m.players : [...m.players].reverse();
  return {
    seats: { w, b },
    stands: {},
    left: { w: THREE_HOURS, b: THREE_HOURS },
    since: null,
    turn: 'w',
    ended: null,
    initial: null,
    actions: [],
  };
}
const materialized = new WeakMap();
function board(g) {
  if (materialized.has(g)) return materialized.get(g);
  const game = g.initial
    ? StandGame.restore(g.initial)
    : new StandGame(undefined, 0, {
        w: g.stands.w || 'crimson',
        b: g.stands.b || 'world',
      });
  const room = {
    game,
    b: Boolean(g.initial),
    version: g.initial ? 2 : 1,
    privateUpdates: { w: 0, b: 0 },
  };
  rememberDustPosition(room);
  for (const row of g.actions) {
    if (!playAction(room, row.side, row.action))
      throw fail(503, 'Не удалось восстановить турнирную партию.');
    if (row.calamity) game.state.events.at(-1).calamity = row.calamity;
  }
  if (g.ended) room.version++;
  materialized.set(g, room);
  return room;
}
const authCache = new Map();
async function account(token) {
  if (!token || token.length > 8192) throw fail(401, 'Войдите через Google.');
  const key = createHash('sha256').update(token).digest('hex'),
    cached = authCache.get(key);
  if (cached?.until > Date.now()) return cached.value;
  const response = await identity('lookup', { idToken: token }),
    user = response.users?.[0];
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  if (
    !user ||
    !user.emailVerified ||
    claims.firebase?.sign_in_provider !== 'google.com'
  )
    throw fail(403, 'Требуется подтверждённый аккаунт Google.');
  const res = await fetch(
    'https://firestore.googleapis.com/v1/projects/' +
      config.projectId +
      '/databases/(default)/documents/profiles/' +
      encodeURIComponent(user.localId),
    {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(9000),
    },
  );
  if (!res.ok && res.status !== 404)
    throw fail(503, 'Не удалось проверить игровой профиль.');
  const value = {
    id: createHash('sha256')
      .update('standchess-tournament:' + user.localId)
      .digest('hex')
      .slice(0, 32),
    nick: res.ok ? (await res.json()).fields.nick.stringValue : '',
    organizer: Boolean(
      process.env.TOURNAMENT_ORGANIZER &&
        user.email.toLowerCase() ===
          process.env.TOURNAMENT_ORGANIZER.toLowerCase(),
    ),
  };
  if (value.nick) {
    if (authCache.size >= 1000) authCache.delete(authCache.keys().next().value);
    authCache.set(key, {
      value,
      until: Math.min(Date.now() + 300000, claims.exp * 1000),
    });
  }
  return value;
}
class Tournament {
  constructor(store = new TournamentStore(), now = Date.now) {
    this.store = store;
    this.now = now;
    this.presence = new Map();
    this.pending = Promise.resolve();
  }
  async handle(op, id, user, body = {}, query = new URLSearchParams()) {
    const run = async () => {
      for (let n = 0; n < 8; n++) {
        const meta = await this.store.read('current'),
          t = structuredClone(meta.value || empty());
        const now = this.now();
        const overdue = t.rounds
          .flat()
          .find((m) => m.deadline && m.deadline <= now);
        if (overdue) {
          const record = await this.store.read(
            overdue.id + '-' + overdue.number,
          );
          if (!record.value)
            throw fail(503, 'Не удалось восстановить часы партии.');
          const g = structuredClone(record.value);
          g.left[g.turn] = 0;
          conclude(t, overdue, g, 'timeout', other(g.turn));
          if (
            await this.store.save([
              [meta, t],
              [record, g],
            ])
          ) {
            n = -1;
            continue;
          }
          continue;
        }
        if (!id) {
          if (op === 'view')
            return {
              tournament: t,
              me: user ? { id: user.id, organizer: user.organizer } : null,
            };
          if (!user || (op !== 'start' && !user.nick))
            throw fail(403, 'Для участия нужен игровой ник.');
          if (t.phase !== 'registration')
            throw fail(409, 'Регистрация завершена.');
          if (op === 'start') {
            if (!user.organizer)
              throw fail(403, 'Начать турнир может только организатор.');
            start(t);
          } else if (op === 'register') {
            if (!t.players.some((p) => p.id === user.id))
              t.players.push({ id: user.id, nick: user.nick });
            else
              return {
                tournament: t,
                me: { id: user.id, organizer: user.organizer },
              };
          } else if (op === 'withdraw')
            t.players = t.players.filter((p) => p.id !== user.id);
          else throw fail(404, 'Нет такого действия.');
          if (await this.store.save([[meta, t]]))
            return {
              tournament: t,
              me: { id: user.id, organizer: user.organizer },
            };
          continue;
        }
        const m = t.rounds
          .flat()
          .find((match) => match.id === id.split('-')[0]);
        if (!m || !m.players.every(Boolean) || !m.players.includes(user?.id))
          throw fail(403, 'В это лобби могут войти только участники пары.');
        const record = await this.store.read(id);
        if (
          !record.value &&
          (m.winner || id !== m.id + '-' + m.number || op !== 'enter')
        )
          throw fail(404, 'Эта партия ещё не открыта.');
        let g = record.value || seedGame(m);
        const side = g.seats.w === user.id ? 'w' : 'b';
        if (op === 'depart') {
          this.presence.delete(id + ':' + side);
          return null;
        }
        let changed = false;
        if (op === 'leave') {
          if (g.ended) return null;
          if (!g.stands[side]) throw fail(403, 'Сначала войдите в лобби.');
          g = { ...g, left: clockView(g, now).left };
          conclude(t, m, g, 'resign', other(side));
          if (!(await this.store.save([[record, g], [meta, t]]))) continue;
          this.presence.delete(id + ':w');
          this.presence.delete(id + ':b');
          return null;
        }
        if (!g.initial && !g.ended && (op === 'enter' || op === 'poll')) {
          if (op === 'enter' && !Object.hasOwn(STANDS, body.stand))
            throw fail(400, 'Выберите стенд.');
          if (!g.stands[side] && op !== 'enter')
            throw fail(403, 'Сначала войдите в лобби.');
          const key = id + ':' + side;
          this.presence.set(key, now);
          if (op === 'enter' && g.stands[side] !== body.stand) {
            g = structuredClone(g);
            g.stands[side] = body.stand;
            changed = true;
          }
          if (
            g.stands[other(side)] &&
            now - (this.presence.get(id + ':' + other(side)) ?? -Infinity) <
              15000
          ) {
            if (!changed) g = structuredClone(g);
            g.initial = new StandGame(undefined, 0, g.stands).snapshot();
            g.since = now;
            m.deadline = now + THREE_HOURS;
            changed = true;
            this.presence.delete(id + ':' + other(side));
            this.presence.delete(key);
          }
        }
        if (op === 'action') {
          if (!g.initial || g.ended) throw fail(409, 'Партия сейчас не идёт.');
          const previous = board(g);
          if (
            body.version !== seatVersion(previous, side) ||
            (body.type !== 'merge' && g.turn !== side)
          )
            throw fail(409, 'Позиция изменилась. Проверьте ход.');
          const { type, from, to, promotion, target, choice } = body;
          const action = { type, from, to, promotion, target, choice };
          const room = {
            ...previous,
            game: StandGame.restore(previous.game.snapshot()),
            frames: previous.frames?.slice(),
            privateUpdates: { ...previous.privateUpdates },
          };
          if (!playAction(room, side, action))
            throw fail(422, 'Действие недоступно в этой позиции.');
          g = {
            ...g,
            left: clockView(g, now).left,
            actions: [
              ...g.actions,
              {
                side,
                action,
                calamity: room.game.state.events.at(-1)?.calamity,
              },
            ],
          };
          g.turn = room.game.turn();
          g.since = now;
          m.deadline = now + g.left[g.turn];
          const verdict = room.game.result();
          if (verdict) {
            conclude(
              t,
              m,
              g,
              verdict,
              verdict.startsWith('Мат') ? other(g.turn) : null,
            );
            room.version++;
          }
          materialized.set(g, room);
          changed = true;
        }
        if (
          changed &&
          !(await this.store.save([
            [record, g],
            [meta, t],
          ]))
        )
          continue;
        const room = board(g),
          clock = clockView(g, now);
        const at = query.has('at') ? Number(query.get('at')) : undefined;
        if (at !== undefined && (!Number.isInteger(at) || !room.frames?.[at]))
          throw fail(400, 'Нет такой позиции.');
        if (
          op === 'poll' &&
          at === undefined &&
          query.get('since') === String(seatVersion(room, side))
        )
          return null;
        return {
          ...roomState(room, side, at),
          clock,
          series: {
            id: m.id,
            number: Number(id.split('-')[1]),
            target: m.target,
            score: m.wins,
            players: m.players.map(
              (p) => t.players.find((u) => u.id === p).nick,
            ),
          },
        };
      }
      throw fail(409, 'Турнир обновляется. Повторите действие.');
    };
    const result = this.pending.then(run);
    this.pending = result.catch(() => {});
    return result;
  }
}
module.exports = { Tournament, account, THREE_HOURS };
