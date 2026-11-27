'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StandGame } = require('../engine');
const { scenario } = require('./fixtures/scenarios.cjs');
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

test('enemy mark prevents moving and ticks only on subsequent caster turns', () => {
  const g = game();
  assert.ok(g.activate('w', 'g7'));
  assert.deepEqual(to(g, 'g7'), []);
  assert.equal(g.move('g7', 'g6'), null);
  assert.ok(g.move('a7', 'a6'));
  assert.deepEqual(g.chess.get('g7').transparent, { caster: 'w', turns: 2 });
  assert.ok(g.move('d2', 'd4'));
  assert.equal(g.move('g7', 'g6'), null);
  assert.ok(g.move('a6', 'a5'));
  assert.equal(g.chess.get('g7').transparent.turns, 1);
  assert.ok(g.move('a2', 'a3'));
  assert.ok(!g.chess.get('g7').transparent);
  assert.ok(g.move('g7', 'g6'));
});
test('both sides can cross a zipped piece; neither can land on it until the effect expires', () => {
  const g = game('4k3/8/8/8/8/8/1P5r/1R2K3 w - - 0 1');
  assert.ok(g.activate('w', 'b2'));
  assert.ok(to(g, 'h2').includes('a2'));
  assert.ok(!to(g, 'h2').includes('b2'));
  assert.equal(g.move('h2', 'b2'), null);
  assert.ok(g.move('h2', 'a2'));
  assert.equal(g.chess.get('b2').type, 'p');
  assert.deepEqual(to(g, 'b2'), []);
  assert.equal(g.move('b2', 'b3'), null);
  assert.ok(!to(g, 'b1').includes('b2'));
  assert.ok(g.move('b1', 'b5'));
  assert.equal(g.chess.get('b2').transparent.turns, 1);
  assert.ok(g.move('a2', 'h2'));
  assert.equal(g.chess.get('b2').transparent.turns, 1);
  assert.ok(g.move('b5', 'b4'));
  assert.ok(!g.chess.get('b2').transparent);
  assert.ok(g.move('h2', 'b2'));
  assert.deepEqual(g.chess.get('b2'), { type: 'r', color: 'b' });
});
test('passable intermediate squares work for pawns but their destination must be free', () => {
  const g = game('4k3/8/8/8/8/2B5/2P5/4K3 w - - 0 1');
  assert.ok(g.activate('w', 'c3'));
  assert.ok(g.move('e8', 'd8'));
  assert.ok(!to(g, 'c2').includes('c3'));
  assert.ok(g.move('c2', 'c4'));
  assert.equal(g.chess.get('c3').type, 'b');
});
test('en passant cannot use a zipped destination or a zipped capturing pawn', () => {
  const occupied = game('4k3/8/8/8/1p6/2B5/2P5/4K3 w - - 0 1');
  assert.ok(occupied.activate('w', 'c3'));
  assert.ok(occupied.move('e8', 'd8'));
  assert.ok(occupied.move('c2', 'c4'));
  assert.equal(occupied.state.position.ep, 'c3');
  assert.equal(occupied.move('b4', 'c3'), null);
  assert.equal(occupied.chess.get('c4').type, 'p');
  const disabled = game('4k3/3p4/8/4P3/8/8/P7/4K3 w - - 0 1');
  assert.ok(disabled.activate('w', 'e5'));
  assert.ok(disabled.move('d7', 'd5'));
  assert.equal(disabled.state.position.ep, 'd6');
  assert.equal(disabled.move('e5', 'd6'), null);
  assert.equal(disabled.chess.get('d5').type, 'p');
});
test('a zipped checking rook stops attacking and its square stays unavailable to the king', () => {
  const g = game('7k/7p/8/8/8/8/4r3/4K3 w - - 0 1');
  assert.ok(g.chess.in_check());
  assert.ok(g.activate('w', 'e2'));
  assert.ok(g.move('h7', 'h6'));
  assert.equal(g.chess.in_check(), false);
  assert.ok(!to(g, 'e1').includes('e2'));
  assert.ok(g.move('e1', 'd2'));
  assert.ok(g.move('h6', 'h5'));
  // The rook returns at the end of this turn; the king must leave its attack.
  assert.equal(g.move('d2', 'c2'), null);
  assert.ok(g.move('d2', 'c3'));
  assert.ok(!g.chess.get('e2').transparent);
  assert.ok(g.move('e2', 'c2'));
  assert.ok(g.chess.in_check());
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
test('castling cannot move a zipped rook; its castling right survives until the rook returns', () => {
  for (const [rook, destination] of [
    ['a1', 'c1'],
    ['h1', 'g1'],
  ]) {
    const g = game('4k3/p7/8/8/8/8/P7/R3K2R w KQ - 0 1');
    assert.ok(g.activate('w', rook));
    assert.ok(g.move('e8', 'e7'));
    assert.equal(g.move('e1', destination), null);
    assert.ok(g.move('a2', 'a3'));
    assert.ok(g.move('e7', 'e8'));
    assert.equal(g.move('e1', destination), null);
    assert.ok(g.move('a3', 'a4'));
    assert.ok(g.move('a7', 'a6'));
    assert.ok(g.move('e1', destination));
  }
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

test('a saved historical move replays under its original rules and the live game uses the new rules', () => {
  const history = new StandGame(
    'k7/6pp/8/8/5K2/8/P7/8 w - - 0 1',
    100,
    { w: 'sticky' },
    null,
    1,
    1,
  );
  assert.ok(history.activate('w', 'g7'));
  assert.ok(history.move('g7', 'g6'));
  assert.equal(history.move('f4', 'f5'), null);
  const saved = history.snapshot();
  delete saved.stickyRulesFrom;
  delete saved.position.stickyRules;
  delete saved.lastMove.previous.stickyRules;
  const live = StandGame.restore(saved);
  assert.equal(live.state.stickyRulesFrom, 2);
  history.useCurrentStickyRules();
  for (const game of [live, history]) assert.ok(game.move('f4', 'f5'));
  assert.deepEqual(live.state.position, history.state.position);
  assert.equal(StandGame.restore(live.snapshot()).state.stickyRulesFrom, 2);
});
