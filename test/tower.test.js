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
