'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { StandGame } = require('../engine');
const { scenario } = require('./fixtures/scenarios.cjs');
const { Chess } = require('../vendor/chess.min.js');
const game = (fen, w, b = 'world', mana = 150) =>
  new StandGame(fen, mana, { w, b });
const move = (g, from, to) => assert.ok(g.move(from, to), from + '–' + to);
test('ordinary moves and attacked king agree with chess.js in positions reached on the board', () => {
  for (let run = 0; run < 4; run++) {
    const g = game(undefined, 'gold', 'kiss', 0),
      ref = new Chess();
    for (let ply = 0; ply < 70; ply++) {
      const key = (m) => m.from + m.to + (m.promotion || ''),
        list = g.moves(),
        normal = ref.moves({ verbose: true });
      assert.deepEqual(list.map(key).sort(), normal.map(key).sort());
      assert.equal(g.chess.in_check(), ref.in_check());
      if (!list.length || g.result()) break;
      const m = list[(run * 23 + ply * 13) % list.length];
      assert.ok(g.move(m.from, m.to, m.promotion));
      ref.move(m);
    }
  }
});
test('Enigma removes retreating pieces of either colour, checks the final position, and disallows royal retreat', () => {
  const g = scenario('enigma');
  assert.ok(g.activate('w'));
  move(g, 'e2', 'e3');
  assert.ok(g.moves('e5').find((m) => m.to === 'e6').shot);
  move(g, 'e5', 'e6');
  assert.equal(g.chess.get('e6'), null);
  assert.equal(g.p.snared.b, false);
  const b = game('k7/8/8/8/2R5/7p/8/6K1 b - - 0 1', 'gold', 'enigma');
  assert.ok(b.activate('b'));
  move(b, 'a8', 'b8');
  move(b, 'c4', 'c3');
  assert.equal(b.chess.get('c3'), null);
  const k = game('8/7k/8/8/3R4/8/8/K7 w - - 0 1', 'enigma');
  k.activate('w');
  move(k, 'd4', 'd3');
  assert.ok(!k.moves('h7').some((m) => m.to === 'h8'));
  const pin = game('4k3/8/4r3/8/8/8/8/K3R3 w - - 0 1', 'enigma');
  pin.activate('w');
  move(pin, 'a1', 'a2');
  assert.ok(!pin.moves('e6').some((m) => m.to === 'e7'));
});
test('Gold spends 150 on a friendly pawn and rejects invalid pieces or insufficient mana', () => {
  const g = scenario('gold'),
    before = g.snapshot();
  for (const c of ['q', 'k', 'p'])
    assert.equal(g.activate('w', 'e2', c), false);
  assert.equal(g.activate('w', 'e7', 'r'), false);
  assert.deepEqual(g.snapshot(), before);
  assert.ok(g.activate('w', 'e2', 'r'));
  assert.equal(g.chess.get('e2').type, 'r');
  assert.equal(g.state.mana.w, 0);
  assert.equal(g.turn(), 'b');
  const low = game(undefined, 'gold', 'heaven', 140);
  assert.equal(low.activate('w', 'e2', 'n'), false);
  move(low, 'a2', 'a3');
  assert.equal(low.state.mana.w, 150);
});
test('Kiss links both directions, expires after two owner turns, and merges out of turn without changing mana', () => {
  const fen = '7k/8/8/3r4/1N6/8/8/K7 w - - 0 1';
  const g = game(fen, 'kiss');
  assert.ok(g.activate('w', 'b4', 'c5'));
  let saved = StandGame.restore(g.snapshot());
  assert.ok(saved.canMerge('w'));
  assert.ok(saved.merge('w'));
  assert.equal(saved.turn(), 'b');
  assert.equal(saved.state.mana.w, 0);
  assert.ok(saved.chess.get('b4'));
  assert.equal(saved.chess.get('c5'), null);
  assert.equal(g.merge('b'), false);
  move(g, 'd5', 'c5');
  assert.equal(g.chess.get('b4'), null);
  assert.equal(g.chess.get('c5').type, 'r');
  const original = game('7k/8/8/1r6/1N6/8/8/K7 w - - 0 1', 'kiss');
  assert.ok(original.activate('w', 'b4', 'c5'));
  move(original, 'b5', 'b4');
  assert.equal(original.chess.get('c5'), null);
  const life = game(fen, 'kiss');
  life.activate('w', 'b4', 'b3');
  move(life, 'h8', 'g8');
  move(life, 'b3', 'd4');
  move(life, 'g8', 'h8');
  assert.ok(life.chess.get('d4'));
  move(life, 'a1', 'a2');
  assert.equal(life.chess.get('d4'), null);
  assert.ok(life.chess.get('b4'));
});
test('Heaven rewrites either side within three king steps, preserves identity, and changes actual attacks', () => {
  const g = game('7k/8/8/8/3r4/8/2B5/K7 w - - 0 1', 'heaven');
  assert.ok(g.activate('w', 'd4', 'n'));
  assert.equal(g.chess.get('d4').type, 'r');
  assert.ok(g.moves('d4').some((m) => m.to === 'c2'));
  assert.ok(!g.moves('d4').some((m) => m.to === 'd3'));
  const s = StandGame.restore(g.snapshot());
  assert.equal(s.chess.get('d4').walk, 'n');
  const far = game('7k/8/8/4r3/8/8/2B5/KQ6 w - - 0 1', 'heaven');
  for (const sq of ['a1', 'b1', 'h8', 'e5'])
    assert.ok(!far.targets('w').includes(sq));
  const bishop = game('7k/8/8/8/8/2B5/8/K7 w - - 0 1', 'heaven');
  assert.ok(bishop.activate('w', 'c3', 'p'));
  move(bishop, 'h8', 'g8');
  assert.deepEqual(
    bishop.moves('c3').map((m) => m.to),
    ['c4'],
  );
});
test('House has exactly three owner-only rooms. A rook in a room can check the king', () => {
  const g = scenario('house');
  assert.ok(!g.moves().some((m) => m.to === 'i2'));
  move(g, 'h4', 'i4');
  move(g, 'e8', 'e7');
  move(g, 'i4', 'i5');
  move(g, 'e7', 'e6');
  move(g, 'i5', 'e5');
  assert.ok(g.chess.in_check());
  const test = game('8/8/8/8/k6R/8/8/6K1 w - - 0 1', 'house');
  move(test, 'h4', 'i4');
  assert.ok(test.chess.in_check());
  const no = game('8/7k/8/8/7r/8/8/6K1 b - - 0 1', 'house');
  assert.ok(no.moves('h4').every((m) => m.to[0] !== 'i'));
  const king = game('7k/8/8/8/7K/8/R7/8 w - - 0 1', 'house');
  assert.ok(king.moves('h4').every((m) => m.to[0] !== 'i'));
});
test('checkmate considers affordable magical defenses, including a rewrite, a copy and a rewind', () => {
  const fen = '8/8/8/8/8/2k5/1r6/KrN5 w - - 0 1';
  const g = game(fen, 'heaven');
  assert.equal(g.chess.in_check(), true);
  assert.equal(g.moves().length, 0);
  assert.equal(g.result(), '');
  assert.ok(g.activate('w', 'b1', 'p'));
  assert.ok(!g.chess.in_check() || g.turn() === 'b');
  const low = game(fen, 'heaven', 'world', 140);
  assert.match(low.result(), /Мат/);
  const block = game('8/8/8/7r/8/2k5/1r6/K6r w - - 0 1', 'kiss');
  assert.match(block.result(), /Мат/);
  const kiss = game('8/8/8/8/8/2k5/1rP5/K6r w - - 0 1', 'kiss');
  assert.equal(kiss.moves().length, 0);
  assert.equal(kiss.result(), '');
  assert.ok(kiss.activate('w', 'c2', 'b1'));
  assert.equal(kiss.chess.get('b1').type, 'p');
  const rewind = game(undefined, 'crimson', 'enigma', 100);
  move(rewind, 'f2', 'f3');
  move(rewind, 'e7', 'e5');
  move(rewind, 'g2', 'g4');
  move(rewind, 'd8', 'h4');
  assert.equal(rewind.result(), '');
  assert.ok(rewind.activate('w'));
  assert.equal(rewind.chess.get('h4'), null);
});
test('mixed stands preserve tower occupancy, en passant, castling, resurrection and the extra turn', () => {
  const t = new StandGame(
    '7k/8/8/8/3R4/8/8/7K w - - 0 1',
    100,
    { w: 'superfly', b: 'enigma' },
    'c3',
  );
  assert.equal(t.move('d4', 'e4'), null);
  move(t, 'd4', 'd3');
  const c = game('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'kiss');
  move(c, 'e1', 'g1');
  assert.equal(c.chess.get('f1').type, 'r');
  const ep = game('7k/8/8/4P3/8/8/8/7K b - - 0 1', 'kiss');
  assert.equal(ep.moves('e5').length, 0);
  const ep2 = game('7k/3p4/8/4P3/8/8/8/7K b - - 0 1', 'kiss');
  move(ep2, 'd7', 'd5');
  move(ep2, 'e5', 'd6');
  assert.equal(ep2.chess.get('d5'), null);
  const d = game(undefined, 'diamond', 'enigma');
  move(d, 'e2', 'e4');
  move(d, 'd7', 'd5');
  move(d, 'b1', 'c3');
  move(d, 'd5', 'e4');
  assert.ok(d.activate('w', 'e2'));
  assert.equal(d.chess.get('e2').type, 'p');
  const world = game(undefined, 'world', 'house');
  assert.ok(world.activate('w'));
  move(world, 'e2', 'e4');
  assert.equal(world.turn(), 'w');
  move(world, 'g1', 'f3');
  assert.equal(world.turn(), 'b');
});
test('merging and expiration cannot expose the royal king to a rook', () => {
  const g = game('7k/8/8/8/8/2N5/8/K6r w - - 0 1', 'kiss');
  // A knight adjacent to the line creates a shield between king and rook.
  const block = game('7k/8/8/8/8/8/2N5/K6r w - - 0 1', 'kiss');
  assert.ok(block.activate('w', 'c2', 'd1'));
  assert.equal(block.canMerge('w'), false);
  assert.equal(block.merge('w'), false);
  assert.ok(!g.choices('w').some((o) => o.target === 'c3'));
});
