'use strict';
const { StandGame, MAX_MANA } = require('../../engine');
const scenarios = {
  dust: {
    stands: { w: 'dust' },
    mana: 100,
    fen: 'k7/8/8/8/3r4/8/P2R4/6K1 w - - 0 1',
  },
  sticky: {
    stands: { w: 'sticky' },
    mana: MAX_MANA,
    fen: '4k3/8/8/8/8/8/P6r/R3K3 w - - 0 1',
  },
  wonder: {
    stands: { w: 'wonder' },
    mana: MAX_MANA,
    fen: 'k7/8/8/7r/8/8/P7/4K3 w - - 0 1',
  },
  enigma: {
    stands: { w: 'enigma' },
    mana: 100,
    fen: '4k3/8/8/4r3/8/8/4P3/4K3 w - - 0 1',
  },
  gold: {
    stands: { w: 'gold' },
    mana: 150,
  },
  kiss: {
    stands: { w: 'kiss' },
    mana: 100,
  },
  heaven: {
    stands: { w: 'heaven' },
    mana: 150,
  },
  house: {
    stands: { w: 'house' },
    fen: '4k3/8/8/8/7R/8/8/4K3 w - - 0 1',
  },
  superfly: {
    stands: { w: 'superfly' },
    tower: 'c3',
    fen: '7k/8/8/8/3R4/8/8/7K w - - 0 1',
  },
  echoes: {
    mana: MAX_MANA,
    stands: { w: 'echoes' },
  },
  diamond: {
    mana: MAX_MANA,
    stands: { w: 'diamond' },
    moves: [
      ['e2', 'e4'],
      ['d7', 'd5'],
      ['b1', 'c3'],
      ['d5', 'e4'],
    ],
  },
  crimson: {
    mana: MAX_MANA,

    moves: [
      ['e2', 'e4'],
      ['d7', 'd5'],
      ['b1', 'c3'],
      ['d5', 'e4'],
    ],
  },
  world: {
    mana: MAX_MANA,

    moves: [['e2', 'e4']],
  },
  check: {
    mana: MAX_MANA,

    moves: [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['a2', 'a3'],
      ['d8', 'h4'],
    ],
  },
  castle: {
    fen: 'r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
  },
  mana: {
    mana: 90,
  },
  promotion: {
    fen: '7k/P7/8/8/8/8/6p1/4K3 w - - 0 1',
  },
  passant: {
    fen: '7k/3p4/8/4P3/8/8/8/K7 b - - 0 1',
    moves: [['d7', 'd5']],
  },
  mate: {
    moves: [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
    ],
  },
  stalemate: {
    fen: 'k7/2Q5/2K5/8/8/8/8/8 w - - 0 1',
  },
};
function scenario(id) {
  const spec = scenarios[id];
  const game = new StandGame(spec.fen, spec.mana, spec.stands, spec.tower);
  for (const [from, to] of spec.moves || []) {
    if (!game.move(from, to)) throw new Error('Некорректная позиция ' + id);
  }
  return game;
}
module.exports = { scenario };
