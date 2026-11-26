'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StandGame, scenario } = require('../engine');

function armed(fen, foe = 'world', tower) {
  const g = new StandGame(fen, 100, { w: 'wonder', b: foe }, tower);
  assert.ok(g.activate('w'));
  assert.equal(g.turn(), 'w');
  assert.equal(g.state.mana.w, 0);
  assert.ok(g.move('a2', 'a3'));
  return g;
}
const rookPosition = 'k7/8/8/7r/8/8/P7/4K3 w - - 0 1';
const discovery = 'k3r3/8/8/4n3/8/8/P7/4K3 w - - 0 1';
test('removing a Kiss sticker can open a checking line before a move', () => {
  const g = new StandGame('k6r/8/8/6n1/8/8/8/6K1 b - - 0 1', 100, {
    w: 'wonder',
    b: 'kiss',
  });
  assert.ok(g.activate('b', 'g5', 'h5'));
  assert.ok(g.activate('w'));
  assert.ok(g.move('g1', 'h1'));
  assert.ok(g.merge('b'));
  assert.equal(g.turn(), 'b');
  assert.deepEqual(
    g.state.events.at(-1).calamity.map((v) => v.square),
    ['h8'],
  );
  assert.equal(g.chess.get('h8'), null);
  assert.equal(g.chess.get('h5'), null);
  assert.equal(g.p.wonder.w, 0);
});
test('time-stop actions count individually and rewinding a move preserves its previously active ward', () => {
  const world = armed(rookPosition);
  assert.ok(world.activate('b'));
  assert.equal(world.p.wonder.w, 3);
  assert.ok(world.move('a8', 'b8'));
  assert.equal(world.turn(), 'b');
  assert.equal(world.p.wonder.w, 2);
  assert.ok(world.move('h5', 'e5').calamity);
  assert.equal(world.turn(), 'w');
  const crimson = armed(rookPosition, 'crimson');
  assert.ok(crimson.activate('b'));
  assert.equal(crimson.p.wonder.w, 3);
  assert.ok(crimson.move('h5', 'e5').calamity);
});
test('the playing side gets three opponent turns of protection; analysis does not change the board', () => {
  const g = armed(rookPosition);
  assert.equal(g.p.wonder.w, 3);
  assert.deepEqual(g.snapshot(), StandGame.restore(g.snapshot()).snapshot());
  const before = g.snapshot();
  g.moves();
  g.result();
  assert.deepEqual(g.snapshot(), before);
  assert.ok(g.move('a8', 'b8'));
  assert.equal(g.p.wonder.w, 2);
  assert.ok(g.move('a3', 'a4'));
  assert.equal(g.p.wonder.w, 2);
  assert.ok(g.move('b8', 'a8'));
  assert.equal(g.p.wonder.w, 1);
  assert.ok(g.move('a4', 'a5'));
  const check = g.move('h5', 'e5');
  assert.deepEqual(
    check.calamity.map((v) => v.square),
    ['e5'],
  );
  assert.equal(check.calamity[0].type, 'r');
  assert.equal(check.calamity[0].color, 'b');
  assert.ok([0, 1, 2].includes(check.calamity[0].variant));
  assert.deepEqual(g.state.events.at(-1).calamity, check.calamity);
  assert.equal(g.p.wonder.w, 0);
  assert.equal(g.chess.get('e5'), null);
  assert.equal(g.chess.in_check(), false);
});
test('a check on the fourth enemy turn lands normally', () => {
  const g = armed(rookPosition);
  for (const [from, to] of [
    ['a8', 'b8'],
    ['a3', 'a4'],
    ['b8', 'a8'],
    ['a4', 'a5'],
    ['a8', 'b8'],
    ['a5', 'a6'],
  ])
    assert.ok(g.move(from, to));
  assert.equal(g.p.wonder.w, 0);
  assert.equal(g.move('h5', 'e5').calamity, undefined);
  assert.equal(g.chess.in_check(), true);
});
test('a discovered check removes the distant checker; a double check catches both checkers', () => {
  const g = armed(discovery),
    replay = StandGame.restore(g.snapshot());
  const first = g.move('e5', 'c4');
  assert.deepEqual(
    first.calamity.map((v) => v.square),
    ['e8'],
  );
  assert.equal(g.chess.get('c4').type, 'n');
  const double = replay.move('e5', 'f3');
  assert.deepEqual(double.calamity.map((v) => v.square).sort(), ['e8', 'f3']);
  assert.equal(replay.chess.in_check(), false);
});
test('removal may neither uncover a check on the mover nor empty the tower', () => {
  const pin = armed('4k3/8/4r3/8/7K/8/P7/4R3 w - - 0 1');
  assert.equal(pin.move('e6', 'e4'), null);
  assert.equal(pin.p.wonder.w, 3);
  const tower = armed('k7/8/8/8/3r4/8/P7/4K3 w - - 0 1', 'superfly', 'd3');
  assert.equal(tower.move('d4', 'e4'), null);
  assert.equal(tower.p.wonder.w, 3);
});
test('a checking transformation counts as a turn and uses the transformed piece', () => {
  const g = new StandGame('k7/7p/8/8/P7/8/8/7K b - - 0 1', 150, {
    w: 'gold',
    b: 'wonder',
  });
  assert.ok(g.activate('b'));
  assert.ok(g.move('h7', 'h6'));
  assert.ok(g.activate('w', 'a4', 'r'));
  assert.deepEqual(
    g.state.events.at(-1).calamity.map((v) => [v.square, v.type]),
    [['a4', 'r']],
  );
  assert.equal(g.chess.get('a4'), null);
  assert.equal(g.chess.in_check(), false);
});
test('debug scene reproduces the first check and a protected king cannot walk into an existing attack', () => {
  const g = scenario('wonder');
  assert.ok(g.activate('w'));
  assert.ok(g.move('a2', 'a3'));
  assert.ok(g.move('h5', 'e5').calamity);
  const walk = new StandGame('k7/8/8/3r4/8/8/8/4K3 w - - 0 1', 100, {
    w: 'wonder',
  });
  assert.ok(walk.activate('w'));
  assert.equal(walk.move('e1', 'd1'), null);
  assert.equal(walk.p.wonder.w, 3);
});
