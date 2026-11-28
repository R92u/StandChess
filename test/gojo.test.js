'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StandGame } = require('../engine');
const game = (fen, mana = 100, foe = 'world') =>
  new StandGame(fen, mana, { w: 'gojo', b: foe });

test('Infinity frees the square, supports sharing, and ends on the protected move', () => {
  const g = game('7k/6p1/8/8/8/R7/N6P/R3K3 w - - 0 1');
  assert.ok(g.activate('w', 'a2', 'infinity'));
  assert.equal(g.turn(), 'w');
  assert.equal(g.state.mana.w, 50);
  assert.ok(g.moves('a1').some((m) => m.to === 'a2' && !m.captured));
  assert.ok(g.move('a1', 'a2'));
  assert.deepEqual(g.pieceKeys('a2'), ['a2', 'a2~1']);
  assert.ok(g.move('g7', 'g6'));
  assert.ok(g.moves('a2').every((m) => m.piece === 'r'));
  assert.ok(g.move('a2~1', 'c3'));
  assert.equal(g.p.units.c3.type, 'n');
  assert.deepEqual(g.pieceKeys('a2'), ['a2']);
  assert.deepEqual(StandGame.restore(g.snapshot()).p, g.p);
});

test('Infinity protects enemy pieces, conducts lines, denies kings and disappears beside a lone king', () => {
  const g = game('7k/6p1/8/8/p7/8/7P/R3K3 w - - 0 1');
  assert.equal(g.activate('w', 'h8', 'infinity'), false);
  assert.ok(g.activate('w', 'a4', 'infinity'));
  assert.ok(g.moves('a1').some((m) => m.to === 'a7'));
  assert.ok(g.move('a1', 'a4'));
  assert.equal(g.p.units['a4~1'].color, 'b');
  assert.ok(g.move('a4~1', 'a3'));
  assert.equal(g.p.units.a4.type, 'r');
  const end = game('7k/8/8/8/8/8/1r6/R3K3 w - - 0 1');
  assert.ok(end.activate('w', 'a1', 'infinity'));
  assert.equal(end.pieceKeys('a1').length, 0);
});

test('displacements cost fifty, respect sides, distance, check and the turn', () => {
  const g = game('7k/5p2/8/8/2n5/8/P5P1/R3K3 w - - 0 1');
  const original = g.snapshot();
  for (const [key, choice] of [
    ['c4', 'red:c6'],
    ['c4', 'blue:c2'],
    ['a1', 'red:a2'],
    ['a2', 'red:a1'],
    ['h8', 'blue:g8'],
    ['a1', 'red:a1'],
  ])
    assert.equal(g.activate('w', key, choice), false);
  assert.deepEqual(g.snapshot(), original);
  assert.ok(g.activate('w', 'c4', 'blue:d4'));
  assert.equal(g.p.units.d4.color, 'b');
  assert.equal(g.turn(), 'b');
  assert.equal(g.state.mana.w, 50);
  assert.ok(g.move('f7', 'f6'));
  assert.ok(g.activate('w', 'a1', 'red:c1'));
  assert.equal(g.p.units.c1.type, 'r');
  assert.equal(g.turn(), 'b');
  assert.equal(g.state.mana.w, 0);
  const pin = game('k7/8/8/8/n7/8/7P/R3K3 w - - 0 1');
  assert.equal(pin.activate('w', 'a4', 'blue:b4'), false);
  assert.equal(pin.activate('w', 'a1', 'red:h1'), false);
  const check = game('7k/8/8/8/8/6R1/P7/4K3 w - - 0 1');
  assert.equal(check.activate('w', 'g3', 'red:g5'), true);
  const discovered = game('k7/8/8/8/8/8/B6P/R3K3 w - - 0 1');
  assert.equal(discovered.activate('w', 'a2', 'red:c4'), false);
  const exposed = game('4r2k/8/8/8/8/8/4R2P/4K3 w - - 0 1');
  assert.equal(exposed.activate('w', 'e2', 'infinity'), false);
  assert.equal(exposed.activate('w', 'e2', 'red:g2'), false);
});

test('the third technique hits exactly two adjacent lines with immunity and a fresh cycle', () => {
  const g = game('7k/1p4p1/8/1r6/2B1N3/8/P5P1/R3K3 w - - 0 1');
  assert.equal(g.activate('w', 'a4', 'purple:h4'), false);
  assert.ok(g.activate('w', 'c4', 'infinity'));
  assert.ok(g.activate('w', 'e4', 'red:g4'));
  assert.ok(g.move('g7', 'g6'));
  assert.ok(g.recharge());
  assert.deepEqual(g.p.gojo, { w: 2, b: 0 });
  assert.ok(g.choices('w').every((o) => o.choice.startsWith('purple:')));
  assert.equal(g.activate('w', 'a4', 'purple:h5'), false);
  assert.equal(g.activate('w', 'g4', 'infinity'), false);
  assert.ok(g.activate('w', 'h4', 'purple:a4'));
  assert.equal(g.turn(), 'b');
  assert.deepEqual(g.p.gojo, { w: 0, b: 0 });
  assert.equal(g.state.mana.w, 50);
  for (const sq of ['b5', 'g4']) assert.equal(g.p.units[sq], undefined);
  for (const sq of ['h8', 'e1', 'a1', 'b7', 'c4~1', 'g6', 'a2', 'g2'])
    assert.ok(g.p.units[sq]);
  assert.equal(g.state.events.at(-1).victims.length, 2);
  assert.equal(g.state.events.at(-1).width, 2);
});

test('all 32 paths span exactly 16 main-board squares in both directions', () => {
  for (const vertical of [true, false]) {
    const lanes = vertical ? 'abcdefgh' : '12345678';
    for (const [i, lane] of [...lanes].entries()) {
      const start = vertical ? lane + '1' : 'a' + lane;
      const end = vertical ? lane + '8' : 'h' + lane;
      const cells = new Set(StandGame.purpleBand(start, end));
      assert.equal(cells.size, 16);
      assert.deepEqual(cells, new Set(StandGame.purpleBand(end, start)));
      const pair = [lane, lanes[i === 7 ? 6 : i + 1]];
      for (const f of 'abcdefghi')
        for (const r of '12345678')
          assert.equal(
            cells.has(f + r),
            f !== 'i' && pair.includes(vertical ? f : r),
          );
    }
  }
});

test('previous wide shots replay from their journal while new shots use the two-cell band', () => {
  const saved = game('7k/8/8/8/2N5/8/1r5P/4K3 w - - 0 1');
  saved.p.gojo.w = 2;
  saved.record();
  const old = StandGame.restore(saved.snapshot());
  const replay = require('../analysis').apply;
  assert.ok(
    replay(old, {
      kind: 'ability',
      stand: 'gojo',
      color: 'w',
      target: 'a4',
      choice: 'purple:h4',
      victims: [],
    }),
  );
  assert.equal(old.p.units.b2, undefined);
  assert.ok(saved.activate('w', 'a4', 'purple:h4'));
  assert.ok(saved.p.units.b2);
});

test('each Gojo advances independently and a legal ultimate can escape checkmate', () => {
  const g = game('7k/6p1/8/8/8/8/P5P1/R3K3 w - - 0 1', 100, 'gojo');
  assert.ok(g.activate('w', 'a2', 'infinity'));
  assert.ok(g.move('a1', 'a3'));
  assert.ok(g.activate('b', 'a3', 'blue:a4'));
  assert.deepEqual(g.p.gojo, { w: 1, b: 1 });
  const escape = game('7k/8/8/8/8/8/rr6/K7 w - - 0 1');
  escape.p.gojo.w = 2;
  escape.record();
  assert.equal(escape.moves().length, 0);
  assert.equal(escape.result(), '');
  assert.ok(escape.activate('w', 'a1', 'purple:a8'));
  assert.equal(escape.result(), 'Ничья · недостаточно фигур');
});
