'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StandGame, scenario } = require('../engine');
const { balance, share, label, grade, apply } = require('../analysis');

test('checkmate ends the meter only when no stand can save the king', () => {
  const fen = '8/8/8/8/8/2k5/1r6/KrN5 w - - 0 1';
  const saved = new StandGame(fen, 150, { w: 'heaven', b: 'world' });
  const lost = new StandGame(fen, 140, { w: 'heaven', b: 'world' });
  assert.equal(saved.moves().length, 0);
  assert.equal(saved.result(), '');
  assert.ok(balance(saved) > balance(lost));
  assert.equal(label(balance(lost), lost.result()), 'Мат');
  const before = saved.snapshot();
  assert.ok(saved.activate('w', 'b1', 'p'));
  const row = grade(before, saved.snapshot(), saved.state.events.at(-1));
  assert.ok(row.accuracy > 0 && row.played.includes('b1'));
});

test('the review finds a mating move, marks a missed mate and preserves its inputs', () => {
  const g = scenario('mate');
  const saved = g.snapshot();
  for (const [from, to, expected] of [
    ['d8', 'h4', 'Лучший'],
    ['d7', 'd6', 'Зевок'],
  ]) {
    const current = StandGame.restore(saved);
    assert.ok(current.move(from, to));
    const end = current.snapshot();
    const row = grade(saved, end, end.events.at(-1));
    assert.equal(row.tag, expected);
    assert.equal(row.best, 'd8–h4');
    assert.deepEqual(current.snapshot(), end);
    assert.deepEqual(saved, g.snapshot());
  }
  const draw = scenario('stalemate');
  assert.ok(draw.move('c7', 'b6'));
  assert.equal(balance(draw), 0);
  assert.equal(label(0, draw.result()), '½–½');
});

test('the same board responds to mana, rewritten movement and extra turns', () => {
  const g = new StandGame(undefined, 0, { w: 'world', b: 'world' });
  assert.ok(Math.abs(balance(g)) < 1e-6);
  assert.ok(Math.abs(share(balance(g)) - 0.5) < 1e-6);
  g.state.mana.w = 100;
  assert.ok(balance(g) > 1);
  assert.ok(g.activate('w'));
  assert.ok(balance(g) > 1);
  const h = new StandGame('7k/7p/8/8/8/2B5/8/K7 w - - 0 1', 150, {
    w: 'heaven',
    b: 'gold',
  });
  const ordinary = balance(h);
  assert.ok(h.activate('w', 'c3', 'q'));
  assert.ok(balance(h) > ordinary + 3);
});

test('the public evaluation ignores hidden Bites the Dust targets and private mana', () => {
  const g = scenario('dust');
  const initial = balance(g);
  assert.ok(g.activate('w', 'd2'));
  assert.equal(balance(g), initial);
  const own = g.snapshot();
  const guest = g.snapshot();
  delete guest.mana.w;
  delete guest.position.units.d2.dust;
  assert.equal(balance(StandGame.restore(guest)), initial);
  assert.ok(g.move('a2', 'a3'));
  const event = g.state.events.at(-1);
  assert.deepEqual(
    grade(own, g.snapshot(), event),
    grade(guest, g.snapshot(), event),
  );
});

test('review can replay an underpromotion from the original journal format', () => {
  const g = scenario('promotion');
  assert.ok(apply(g, { kind: 'move', from: 'a7', to: 'a8', san: 'a8=N' }));
  assert.equal(g.chess.get('a8').type, 'n');
});
