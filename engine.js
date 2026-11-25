/* A local two-player variant. chess.js is responsible for orthodox move legality. */
(function (root) {
  'use strict';
  const Chess =
    root.Chess ||
    (typeof require === 'function' && require('./vendor/chess.min.js').Chess);
  const START = new Chess().fen();
  const MAX_MANA = 100;
  const MOVE_MANA = 10;
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function passTurn(fen, next) {
    const fields = fen.split(' ');
    if (fields[1] === 'b' && next === 'w')
      fields[5] = String(Number(fields[5]) + 1);
    if (fields[1] === 'w' && next === 'b')
      fields[5] = String(Math.max(1, Number(fields[5]) - 1));
    fields[1] = next;
    fields[3] = '-'; // An en passant right belongs to the player whose turn was skipped.
    return fields.join(' ');
  }

  class StandGame {
    constructor(fen = START, initialMana = 0) {
      this.chess = new Chess(fen);
      this.state = {
        fen,
        mana: { w: initialMana, b: initialMana },
        freeze: 0,
        lastMove: null,
        events: [],
        positions: [],
      };
      this.record();
    }
    static restore(data) {
      const game = new StandGame();
      if (
        !data ||
        !game.chess.load(data.fen) ||
        !Array.isArray(data.events) ||
        !Array.isArray(data.positions) ||
        !data.positions.length ||
        ![0, 1, 2].includes(data.freeze)
      ) {
        throw new Error('Повреждённая запись партии');
      }
      game.state = copy(data);
      if (!data.mana && data.charges) game.#migrateCharges();
      if (
        !['w', 'b'].every((side) => {
          const value = game.state.mana?.[side];
          return Number.isInteger(value) && value >= 0 && value <= MAX_MANA;
        })
      )
        throw new Error('Некорректная запись маны');
      return game;
    }
    #migrateCharges() {
      const saved = this.state;
      const oldDraw = this.repeated();
      // The old journal contains every move in order, including moves later erased.
      const start = saved.positions[0].split('|')[0] + ' 0 1';
      const replay = new StandGame(start);
      for (const event of saved.events) {
        if (event.kind === 'move') {
          if (!replay.#applyMove(event.san))
            throw new Error('Некорректный ход в журнале');
        } else if (event.kind === 'ability') {
          replay.#applyAbility(event.color);
        } else if (event.kind === 'debug') {
          replay.recharge();
        }
      }
      saved.mana = replay.state.mana;
      if (saved.lastMove)
        saved.lastMove.manaEarned = replay.state.lastMove.manaEarned;
      // A draw already adjudicated under the old rules stays final.
      if (!oldDraw) saved.positions = replay.state.positions;
      delete saved.charges;
    }
    snapshot() {
      return copy(this.state);
    }
    turn() {
      return this.chess.turn();
    }
    moves(square) {
      return this.chess.moves({ square, verbose: true });
    }
    record() {
      this.state.fen = this.chess.fen();
      const fields = this.state.fen.split(' ').slice(0, 4);
      if (
        fields[3] !== '-' &&
        !this.chess.moves({ verbose: true }).some((m) => m.flags.includes('e'))
      )
        fields[3] = '-';
      const { mana, freeze, lastMove } = this.state;
      const rewind =
        !freeze &&
        mana.w === MAX_MANA &&
        lastMove?.color === 'b' &&
        !new Chess(lastMove.before).in_check()
          ? lastMove.before.split(' ').slice(0, 3).join(' ') +
            ':' +
            lastMove.manaEarned
          : '';
      this.state.positions.push(
        [fields.join(' '), mana.w, mana.b, freeze, rewind].join('|'),
      );
    }
    repeated() {
      const positions = this.state.positions;
      return (
        positions.filter((key) => key === positions[positions.length - 1])
          .length >= 3
      );
    }
    result() {
      if (this.chess.in_checkmate())
        return this.turn() === 'w' ? 'Мат. Победа чёрных' : 'Мат. Победа белых';
      if (this.chess.in_stalemate()) return 'Ничья · пат';
      if (this.chess.insufficient_material())
        return 'Ничья · недостаточно фигур';
      if (+this.state.fen.split(' ')[4] >= 100)
        return 'Ничья · правило 50 ходов';
      if (this.repeated()) return 'Ничья · повторение позиции';
      return '';
    }
    abilityBlock(color) {
      if (this.result()) return 'Партия завершена';
      if (this.state.freeze) return 'Время остановлено';
      if (this.state.mana[color] < MAX_MANA) return 'Нужно 100 маны';
      if (this.turn() !== color)
        return color === 'w' ? 'Доступно в ход белых' : 'Доступно в ход чёрных';
      if (color === 'w') {
        const last = this.state.lastMove;
        if (!last || last.color !== 'b') return 'Сначала дождитесь хода чёрных';
        if (new Chess(last.before).in_check())
          return 'Нельзя стереть ответ на шах';
      }
      return '';
    }
    activate(color) {
      if (this.abilityBlock(color)) return false;
      this.#applyAbility(color);
      return true;
    }
    #applyAbility(color) {
      const s = this.state;
      s.mana[color] = 0;
      if (color === 'w') {
        const last = s.lastMove;
        this.chess.load(passTurn(last.before, 'w'));
        s.mana.b -= last.manaEarned;
        s.events[last.event].erased = true;
        s.positions.pop();
        s.events.push({
          kind: 'ability',
          color,
          text: 'King Crimson',
          detail: 'Стёрт ход ' + last.san,
        });
        s.lastMove = null;
      } else {
        s.freeze = 2;
        s.events.push({
          kind: 'ability',
          color,
          text: 'The World',
          detail: 'Время остановлено',
        });
      }
      this.record();
    }
    move(from, to, promotion) {
      if (this.result()) return null;
      return this.#applyMove({ from, to, promotion });
    }
    #applyMove(input) {
      const before = this.chess.fen();
      const m = this.chess.move(input);
      if (!m) return null;
      const s = this.state;
      const { from, to } = m;
      const manaEarned = Math.min(MOVE_MANA, MAX_MANA - s.mana[m.color]);
      s.mana[m.color] += manaEarned;
      const event = s.events.length;
      s.events.push({
        kind: 'move',
        color: m.color,
        san: m.san,
        from,
        to,
        piece: m.piece,
        captured: m.captured,
      });
      s.lastMove = {
        before,
        color: m.color,
        from,
        to,
        san: m.san,
        event,
        manaEarned,
      };
      if (s.freeze) {
        s.freeze--;
        // The opponent always gets a reply to check. Terminal positions end the effect.
        if (
          this.chess.in_check() ||
          this.chess.in_stalemate() ||
          this.chess.insufficient_material() ||
          +this.chess.fen().split(' ')[4] >= 100
        )
          s.freeze = 0;
        if (s.freeze) {
          const extra = new Chess(passTurn(this.chess.fen(), 'b'));
          if (extra.moves().length) this.chess.load(extra.fen());
          else s.freeze = 0;
        }
      }
      this.record();
      return m;
    }
    canRecharge() {
      const { freeze, mana } = this.state;
      return !freeze && (mana.w < MAX_MANA || mana.b < MAX_MANA);
    }
    recharge() {
      if (!this.canRecharge()) return false;
      const s = this.state;
      if (s.lastMove?.color === 'b' && s.mana.b < MAX_MANA)
        s.lastMove.manaEarned = 0;
      s.mana = { w: MAX_MANA, b: MAX_MANA };
      s.events.push({ kind: 'debug', text: 'Мана восстановлена' });
      this.record();
      return true;
    }
  }
  const scenarios = {
    crimson: {
      mana: MAX_MANA,
      label: 'King Crimson · стереть взятие',
      moves: [
        ['e2', 'e4'],
        ['d7', 'd5'],
        ['b1', 'c3'],
        ['d5', 'e4'],
      ],
      hint: 'Чёрная пешка только что взяла белую на e4. Активируйте King Crimson, чтобы вернуть обе пешки.',
    },
    world: {
      mana: MAX_MANA,
      label: 'The World · двойной ход',
      moves: [['e2', 'e4']],
      hint: 'Активируйте The World. Попробуйте e7–e5 и g8–f6 подряд.',
    },
    check: {
      mana: MAX_MANA,
      label: 'Шах · стереть атаку',
      moves: [
        ['f2', 'f3'],
        ['e7', 'e5'],
        ['a2', 'a3'],
        ['d8', 'h4'],
      ],
      hint: 'Белым шах. Сотрите ход ферзя или закройтесь пешкой g2–g3.',
    },
    castle: {
      label: 'Рокировка',
      fen: 'r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
      hint: 'Выберите белого короля на e1 и переведите его на g1 или c1.',
    },
    mana: {
      label: 'Мана · от 90 до 100',
      mana: MAX_MANA - MOVE_MANA,
      hint: 'У каждой стороны 90 маны. Сделайте по одному ходу за белых и чёрных, затем активируйте King Crimson.',
    },
    promotion: {
      label: 'Превращение пешки',
      fen: '7k/P7/8/8/8/8/6p1/4K3 w - - 0 1',
      hint: 'Сыграйте a7–a8 и выберите фигуру для превращения.',
    },
    passant: {
      label: 'Взятие на проходе',
      fen: '7k/3p4/8/4P3/8/8/8/K7 b - - 0 1',
      moves: [['d7', 'd5']],
      hint: 'Белая пешка e5 может взять чёрную на проходе. Нажмите e5, затем d6.',
    },
    mate: {
      label: 'Мат в один ход',
      moves: [
        ['f2', 'f3'],
        ['e7', 'e5'],
        ['g2', 'g4'],
      ],
      hint: 'Чёрные ставят мат ходом ферзя d8–h4.',
    },
    stalemate: {
      label: 'Пат в один ход',
      fen: 'k7/2Q5/2K5/8/8/8/8/8 w - - 0 1',
      hint: 'Сыграйте ферзём c7–b6. У чёрного короля не останется ходов.',
    },
  };
  function scenario(id) {
    const spec = scenarios[id];
    const game = new StandGame(spec.fen, spec.mana);
    for (const [from, to] of spec.moves || []) {
      if (!game.move(from, to)) throw new Error('Некорректная позиция ' + id);
    }
    return game;
  }
  const api = { StandGame, scenarios, scenario, MAX_MANA };
  root.StandChess = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
