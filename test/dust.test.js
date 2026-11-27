'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StandGame } = require('../engine');
const { scenario } = require('./fixtures/scenarios.cjs');

test('bait costs 100, follows its carrier and detonates only on a capture', () => {
  const g = scenario('dust');
  assert.equal(g.activate('w', 'g1'), false);
  assert.equal(g.activate('w', 'd4'), false);
  assert.ok(g.activate('w', 'd2'));
  assert.equal(g.state.mana.w, 0);
  assert.equal(g.turn(), 'w');
  assert.ok(g.move('d2', 'd3'));
  assert.equal(g.chess.get('d3').dust, 3);
  const restored = StandGame.restore(g.snapshot());
  assert.ok(restored.move('d4', 'd3').detonation);
  assert.equal(restored.chess.get('d3').color, 'w');
  assert.equal(restored.chess.get('d4'), null);
  assert.equal(restored.turn(), 'w');
});

test('a legal king capture disarms the bait', () => {
  const g = new StandGame('8/8/8/3k4/3R4/8/P7/6K1 w - - 0 1', 100, {
    w: 'dust',
  });
  assert.ok(g.activate('w', 'd4'));
  assert.ok(g.move('a2', 'a3'));
  assert.equal(g.move('d5', 'd4').detonation, undefined);
  assert.equal(g.chess.get('d4').type, 'k');
});

test('bait expires after three completed enemy turns', () => {
  const g = scenario('dust');
  assert.ok(g.activate('w', 'd2'));
  for (const [a, b] of [
    ['a2', 'a3'],
    ['a8', 'b8'],
    ['a3', 'a4'],
    ['b8', 'a8'],
    ['a4', 'a5'],
    ['a8', 'b8'],
  ])
    assert.ok(g.move(a, b));
  assert.ok(!g.chess.get('d2').dust);
  assert.ok(g.move('a5', 'a6'));
  assert.equal(g.move('d4', 'd2').detonation, undefined);
  assert.equal(g.chess.get('d2').color, 'b');
});
