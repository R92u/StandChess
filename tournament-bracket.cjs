'use strict';
const { fail } = require('./tournament-store.cjs');

function seedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < Math.min(8, size)) {
    const next = seeds.length * 2 + 1;
    seeds = seeds.flatMap((n) => [n, next - n]);
  }
  return Array.from(
    { length: size },
    (_, i) =>
      seeds[i % seeds.length] + Math.floor(i / seeds.length) * seeds.length,
  );
}
function seats(t) {
  let size = t.capacity || 8;
  while (size < t.players.length) size *= 2;
  const slots = Array(size).fill(null);
  const order = seedOrder(size);
  for (const player of t.players) {
    if (Number.isInteger(player.slot)) slots[player.slot] = player.id;
  }
  for (const player of t.players) {
    if (Number.isInteger(player.slot)) continue;
    let seed = 1;
    while (slots[order.indexOf(seed)]) seed++;
    player.slot = order.indexOf(seed);
    slots[player.slot] = player.id;
  }
  return slots;
}
function register(t, user, slot) {
  const slots = seats(t);
  const current = t.players.find((p) => p.id === user.id);
  if (current && slot === undefined) return;
  if (!slots.includes(null) && !current) {
    t.capacity = slots.length * 2;
    slots.push(...Array(slots.length).fill(null));
  }
  if (slot === undefined) {
    const order = seedOrder(slots.length);
    let seed = 1;
    while (slots[order.indexOf(seed)]) seed++;
    slot = order.indexOf(seed);
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots.length)
    throw fail(400, 'Выберите слот из сетки.');
  if (slots[slot] && slots[slot] !== user.id)
    throw fail(409, 'Этот слот уже занят.');
  if (current) current.slot = slot;
  else t.players.push({ id: user.id, nick: user.nick, slot });
}
function rounds(slots) {
  const result = [];
  for (let count = slots.length / 2; count >= 1; count /= 2) {
    result.push(
      Array.from({ length: count }, (_, i) => ({
        id: 'r' + (result.length + 1) + 'm' + (i + 1),
        players: result.length ? [null, null] : slots.slice(2 * i, 2 * i + 2),
        wins: [0, 0],
        bans: [null, null],
        target: count === 1 ? 3 : 2,
        number: 1,
        winner: null,
        deadline: null,
      })),
    );
  }
  return result;
}
function advance(t) {
  for (const [r, matches] of t.rounds.entries()) {
    for (const [i, m] of matches.entries()) {
      const sources = r ? t.rounds[r - 1].slice(i * 2, i * 2 + 2) : [];
      if (r) m.players = sources.map((source) => source.winner || null);
      const settled = sources.every((source) => source.done || source.winner);
      if (settled && m.players.filter(Boolean).length < 2) {
        m.winner = m.players.find(Boolean) || null;
        m.done = true;
      }
      if (m.winner) m.done = true;
    }
  }
  t.champion = t.rounds.at(-1)[0].winner;
  if (t.champion) t.phase = 'finished';
}
function start(t) {
  if (t.players.length < 2)
    throw fail(409, 'Для старта нужны минимум два участника.');
  let slots = seats(t);
  while (slots.length > 2) {
    const half = slots.length / 2;
    if (!slots.slice(0, half).some(Boolean)) slots = slots.slice(half);
    else if (!slots.slice(half).some(Boolean)) slots = slots.slice(0, half);
    else if (!slots.some((id, i) => i % 2 === 0 && id && slots[i + 1]))
      slots = slots
        .filter((_, i) => i % 2 === 0)
        .map((id, i) => id || slots[2 * i + 1]);
    else break;
  }
  t.rounds = rounds(slots);
  t.phase = 'playing';
  advance(t);
}
const activeMatch = (t) =>
  t.rounds.flat().find((m) => !m.done && !m.winner && m.players.every(Boolean));
function registration(t) {
  const slots = seats(t);
  return {
    seeds: seedOrder(slots.length),
    rounds: rounds(slots),
    full: slots.every(Boolean),
  };
}
module.exports = { register, start, advance, activeMatch, registration };
