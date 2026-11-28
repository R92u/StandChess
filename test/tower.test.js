'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StandGame, inTower } = require('../engine');

test('Super Fly covers the tower and its immediate neighbours, including diagonals', () => {
  const squares = [...'abcdefgh'].flatMap((f) =>
    [...'12345678'].map((r) => f + r),
  );
  assert.deepEqual(
    squares.filter((s) => inTower('c3', s)),
    ['b2', 'b3', 'b4', 'c2', 'c3', 'c4', 'd2', 'd3', 'd4'],
  );
  assert.deepEqual(
    squares.filter((s) => inTower('a1', s)),
    ['a1', 'a2', 'b1', 'b2'],
  );
  for (const other of ['world', 'enigma']) {
    const stands = { w: 'superfly', b: other };
    const fresh = new StandGame(undefined, 0, stands);
    assert.equal(fresh.chess.get(fresh.state.tower), null);
    assert.ok(['3', '6'].includes(fresh.state.tower[1]));
    assert.ok(fresh.towerOccupants().length);
    const game = new StandGame(
      '7k/8/8/8/3R4/8/8/7K w - - 0 1',
      0,
      stands,
      'c3',
    );
    assert.equal(game.move('d4', 'e4'), null);
    assert.ok(StandGame.restore(game.snapshot()).move('d4', 'd3'));
  }
});

test('previously saved tower matches retain their radius in both engines', () => {
  for (const other of ['world', 'enigma']) {
    const saved = new StandGame(
      '7k/8/8/8/3R4/8/8/7K w - - 0 1',
      0,
      { w: 'superfly', b: other },
      'a1',
      3,
    ).snapshot();
    delete saved.towerRadius;
    if (saved.position) delete saved.position.towerRadius;
    const loaded = StandGame.restore(saved);
    assert.equal(loaded.state.towerRadius, 3);
    assert.deepEqual(loaded.towerOccupants(), ['d4']);
    assert.equal(loaded.move('d4', 'e4'), null);
    assert.ok(loaded.move('d4', 'd3'));
  }
});

test('capture costs 150, follows the original occupants, and expires after the third opposing turn', () => {
  for (const other of ['world', 'enigma']) {
    const fen = '7k/8/3r4/8/2Rb4/8/K7/8 w - - 0 1';
    const stands = { w: 'superfly', b: other };
    const poor = new StandGame(fen, 140, stands, 'd4');
    assert.equal(poor.activate('w'), false);
    assert.ok(poor.move('a2', 'a3'));
    assert.equal(poor.state.mana.w, 150);
    let game = new StandGame(fen, 150, stands, 'd4');
    assert.ok(game.activate('w'));
    assert.equal(game.state.mana.w, 0);
    assert.equal(game.turn(), 'w');
    assert.equal(game.move('c4', 'b4'), null);
    assert.ok(game.move('c4', 'c5'));
    game = StandGame.restore(game.snapshot());
    assert.equal(game.move('d4', 'f2'), null);
    assert.ok(game.move('d6', 'd5'));
    assert.equal(game.move('c5', 'c6'), null);
    assert.ok(game.move('c5', 'c4'));
    assert.ok(game.move('d5', 'd6'));
    assert.ok(game.move('c4', 'c5'));
    assert.equal(game.move('d4', 'f2'), null);
    assert.ok(game.move('d4', 'e5'));
    assert.ok(game.move('c5', 'c6'));
  }
});
test('a captured occupant does not pass its restriction to its captor; castling respects a trapped rook', () => {
  for (const other of ['world', 'enigma']) {
    const g = new StandGame(
      '4k3/8/8/8/2br4/8/8/2R1K3 w - - 0 1',
      150,
      { w: 'superfly', b: other },
      'd4',
    );
    assert.ok(g.activate('w'));
    assert.ok(g.move('c1', 'c4'));
    assert.ok(g.move('e8', 'e7'));
    assert.ok(g.move('c4', 'c1'));
    const castle = new StandGame(
      '4k3/8/8/8/8/8/7P/4K2R w K - 0 1',
      150,
      { w: 'superfly', b: other },
      'h2',
    );
    assert.ok(castle.moves('e1').some((m) => m.to === 'g1'));
    assert.ok(castle.activate('w'));
    assert.equal(castle.move('e1', 'g1'), null);
  }
});
test('Gojo cannot push or pull a tower captive beyond its boundary', () => {
  const g = new StandGame(
    '7k/8/8/8/2Rb4/8/8/K7 w - - 0 1',
    150,
    { w: 'superfly', b: 'gojo' },
    'd4',
  );
  assert.ok(g.activate('w'));
  assert.ok(g.move('a1', 'a2'));
  assert.equal(g.activate('b', 'c4', 'blue:b4'), false);
  assert.equal(g.activate('b', 'd4', 'red:f4'), false);
  assert.ok(g.activate('b', 'c4', 'blue:c5'));
});
