'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StandGame, scenario } = require('../engine');
const game = (fen, stands = { w: 'sticky', b: 'world' }, mana = 100) =>
  new StandGame(fen, mana, stands);
const to = (g, sq) => g.moves(sq).map((m) => m.to);

test('zip targets either side including queens; it spends the move and 100 mana', () => {
  const g = game();
  assert.ok(g.targets('w').includes('d1'));
  assert.ok(g.targets('w').includes('d8'));
  for (const illegal of ['e8', 'e1', 'c4'])
    assert.equal(g.activate('w', illegal), false);
  assert.equal(g.state.mana.w, 100);
  assert.ok(g.activate('w', 'd1'));
  assert.equal(g.turn(), 'b');
  assert.equal(g.state.mana.w, 0);
  assert.deepEqual(g.chess.get('d1').transparent, { caster: 'w', turns: 2 });
  const low = game(undefined, { w: 'sticky' }, 90);
  assert.equal(low.activate('w', 'a2'), false);
});

test('enemy mark follows its target and ticks only on caster turns', () => {
  const g = game();
  assert.ok(g.activate('w', 'g7'));
  assert.ok(g.move('g7', 'g6'));
  assert.deepEqual(g.chess.get('g6').transparent, { caster: 'w', turns: 2 });
  assert.ok(g.move('d2', 'd4'));
  assert.ok(g.move('g6', 'g5'));
  assert.equal(g.chess.get('g5').transparent.turns, 1);
  assert.ok(g.move('a2', 'a3'));
  assert.ok(!g.chess.get('g5').transparent);
});
test('both sides can cross the transparent piece and the opponent can capture it normally', () => {
  const g = game('4k3/8/8/8/8/8/1P5r/1R2K3 w - - 0 1');
  assert.ok(g.activate('w', 'b2'));
  const take = StandGame.restore(g.snapshot());
  assert.ok(to(g, 'h2').includes('a2'));
  assert.ok(take.move('h2', 'b2'));
  assert.equal(take.chess.get('b2').type, 'r');
  assert.equal(take.chess.get('b2').transparent, undefined);
  assert.ok(g.move('h2', 'a2'));
  assert.equal(g.chess.get('b2').type, 'p');
  assert.ok(!to(g, 'b1').includes('b2'));
  assert.ok(g.move('b1', 'b5'));
  assert.equal(g.chess.get('b2').transparent.turns, 1);
  assert.ok(g.move('a2', 'a3'));
  assert.equal(g.chess.get('b2').transparent.turns, 1);
  assert.ok(g.move('b2', 'b3'));
  assert.ok(!g.chess.get('b3').transparent);
});
test('passable intermediate squares work for pawns but their destination must be free', () => {
  const g = game('4k3/8/8/8/8/2B5/2P5/4K3 w - - 0 1');
  assert.ok(g.activate('w', 'c3'));
  assert.ok(g.move('e8', 'd8'));
  assert.ok(!to(g, 'c2').includes('c3'));
  assert.ok(g.move('c2', 'c4'));
  assert.equal(g.chess.get('c3').type, 'b');
});
test('a zip cannot expose its own king and can uncover a genuine check', () => {
  const pin = game('7k/8/8/8/8/8/8/KB1r4 w - - 0 1');
  assert.equal(pin.activate('w', 'b1'), false);
  const discovered = game('k7/7p/8/8/8/8/P7/R3K3 w - - 0 1');
  assert.ok(discovered.activate('w', 'a2'));
  assert.ok(discovered.chess.in_check());
  assert.equal(discovered.move('h7', 'h6'), null);
  assert.ok(discovered.move('a8', 'b8'));
});
test('queenside castling crosses the b-file but cannot land the king or rook on a zipped piece', () => {
  for (const [fen, target, allowed] of [
    ['4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1', 'b1', true],
    ['4k3/8/8/8/8/8/8/R1B1K3 w Q - 0 1', 'c1', false],
    ['4k3/8/8/8/8/8/8/R2BK3 w Q - 0 1', 'd1', false],
  ]) {
    const g = game(fen);
    assert.ok(g.activate('w', target));
    assert.ok(g.move('e8', 'e7'));
    assert.equal(to(g, 'e1').includes('c1'), allowed);
  }
});
test('additional casts have separate clocks; the current cast does not count itself', () => {
  const g = game();
  assert.ok(g.activate('w', 'a2'));
  assert.ok(g.move('h7', 'h6'));
  assert.ok(g.recharge());
  assert.ok(g.activate('w', 'b2'));
  assert.equal(g.chess.get('a2').transparent.turns, 1);
  assert.equal(g.chess.get('b2').transparent.turns, 2);
  const h = StandGame.restore(g.snapshot());
  assert.ok(h.move('h6', 'h5'));
  assert.ok(h.move('g2', 'g3'));
  assert.ok(!h.chess.get('a2').transparent);
  assert.equal(h.chess.get('b2').transparent.turns, 1);
});
test('debug fixture and rewind preserve the underlying piece and remove a rewound zipper', () => {
  const g = scenario('sticky');
  assert.ok(g.activate('w', 'a2'));
  assert.equal(g.turn(), 'b');
  const reverse = game(undefined, { w: 'sticky', b: 'crimson' });
  assert.ok(reverse.activate('w', 'e2'));
  assert.ok(reverse.activate('b'));
  assert.equal(reverse.chess.get('e2').type, 'p');
  assert.equal(reverse.chess.get('e2').transparent, undefined);
});
