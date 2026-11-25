/* A local two-player variant. chess.js is responsible for orthodox move legality. */
(function (root) {
  'use strict';
  const Chess =
    root.Chess ||
    (typeof require === 'function' && require('./vendor/chess.min.js').Chess);
  const START = new Chess().fen();
  const MAX_MANA = 100;
  const MOVE_MANA = 10;
  const DEFAULT_STANDS = { w: 'crimson', b: 'world' };
  const STANDS = {
    crimson: {
      name: 'King Crimson',
      user: 'Дьяволо',
      art: 'king-crimson',
      power: 'Стирание времени',
      action: 'Стереть ход',
      icon: 'rewind',
      description:
        'Стирает последний ход соперника и возвращает фигуры на место.',
    },
    world: {
      name: 'The World',
      user: 'Дио',
      art: 'the-world',
      power: 'Остановка времени',
      action: 'Остановить время',
      icon: 'clock',
      description: 'Даёт два хода подряд. Шах завершает остановку.',
    },
    echoes: {
      name: 'Echoes ACT 3',
      user: 'Коити',
      art: 'echoes',
      power: 'Three Freeze',
      action: 'Прижать фигуру',
      icon: 'gravity',
      description:
        'Прижимает фигуру на один ход соперника. Король невосприимчив. Прижатая фигура по-прежнему защищает клетки.',
    },
    diamond: {
      name: 'Crazy Diamond',
      user: 'Джоске',
      art: 'diamond',
      power: 'Восстановление',
      action: 'Вернуть фигуру',
      icon: 'gem',
      description:
        'Возвращает фигуру на её свободную стартовую клетку вместо хода. Взятие — до 3 клеток от своего короля. Ферзя вернуть нельзя.',
    },
  };
  const other = (color) => (color === 'w' ? 'b' : 'w');
  const squares = [...'abcdefgh'].flatMap((f) =>
    [...'12345678'].map((r) => f + r),
  );
  const distance = (a, b) =>
    Math.max(
      Math.abs(a.charCodeAt(0) - b.charCodeAt(0)),
      Math.abs(a[1] - b[1]),
    );
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
    constructor(fen = START, initialMana = 0, stands = DEFAULT_STANDS) {
      this.chess = new Chess(fen);
      const selected = { ...DEFAULT_STANDS, ...stands };
      if (!Object.values(selected).every((id) => Object.hasOwn(STANDS, id)))
        throw new Error('Неизвестный стенд');
      this.state = {
        fen,
        stands: selected,
        locked: { w: null, b: null },
        homes: {},
        fallen: [],
        mana: { w: initialMana, b: initialMana },
        freeze: 0,
        lastMove: null,
        events: [],
        positions: [],
      };
      for (const sq of squares) {
        const p = this.chess.get(sq);
        if (
          p &&
          selected[p.color] === 'diamond' &&
          p.type !== 'k' &&
          p.type !== 'q'
        )
          this.state.homes[sq] = sq;
      }
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
      game.state.stands ??= { ...DEFAULT_STANDS };
      game.state.locked ??= { w: null, b: null };
      game.state.homes ??= {};
      game.state.fallen ??= [];
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
      const moves = this.chess.moves(
        square ? { square, verbose: true } : { verbose: true },
      );
      const lock = this.state.locked[this.turn()];
      return lock
        ? moves.filter(
            (m) =>
              m.from !== lock &&
              !(m.flags.includes('k') && lock === 'h' + m.from[1]) &&
              !(m.flags.includes('q') && lock === 'a' + m.from[1]),
          )
        : moves;
    }
    targets(color) {
      const stand = this.state.stands[color];
      if (stand === 'echoes')
        return squares.filter((sq) => {
          const p = this.chess.get(sq);
          return p?.color === other(color) && p.type !== 'k';
        });
      if (stand !== 'diamond') return [];
      return this.state.fallen
        .filter((f) => {
          if (f.color !== color || this.chess.get(f.home)) return false;
          const board = new Chess(this.chess.fen());
          board.put({ color, type: f.type }, f.home);
          return !board.in_check();
        })
        .map((f) => f.home);
    }
    #variantBefore() {
      const { locked, homes, fallen, stands } = this.state;
      return Object.values(stands).some(
        (id) => id === 'echoes' || id === 'diamond',
      )
        ? copy({ locked, homes, fallen })
        : null;
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
        this.state.stands[this.turn()] === 'crimson' &&
        mana[this.turn()] === MAX_MANA &&
        lastMove?.color === other(this.turn()) &&
        !new Chess(lastMove.before).in_check()
          ? lastMove.before.split(' ').slice(0, 3).join(' ') +
            ':' +
            lastMove.manaEarned
          : '';
      let key = [fields.join(' '), mana.w, mana.b, freeze, rewind].join('|');
      const { stands, locked, homes, fallen } = this.state;
      if (stands.w !== DEFAULT_STANDS.w || stands.b !== DEFAULT_STANDS.b) {
        key +=
          '|' +
          JSON.stringify([
            stands.w,
            stands.b,
            locked.w,
            locked.b,
            Object.entries(homes).sort(),
            fallen.map((f) => [f.color, f.home, f.type]).sort(),
          ]);
      }
      this.state.positions.push(key);
    }
    repeated() {
      const positions = this.state.positions;
      return (
        positions.filter((key) => key === positions[positions.length - 1])
          .length >= 3
      );
    }
    result() {
      const side = this.turn();
      const noMoves = this.state.locked[side]
        ? !this.moves().length
        : this.chess.in_checkmate() || this.chess.in_stalemate();
      if (
        noMoves &&
        !(
          this.state.mana[side] === MAX_MANA &&
          this.state.stands[side] === 'diamond' &&
          this.targets(side).length
        )
      ) {
        if (this.chess.in_check())
          return side === 'w' ? 'Мат. Победа чёрных' : 'Мат. Победа белых';
        return 'Ничья · пат';
      }
      if (this.chess.insufficient_material() && !this.state.fallen.length)
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
      const stand = this.state.stands[color];
      if (stand === 'crimson') {
        const last = this.state.lastMove;
        if (!last || last.color !== other(color)) return 'После хода соперника';
        if (new Chess(last.before).in_check())
          return 'Нельзя стереть ответ на шах';
      }
      if (stand === 'diamond' && !this.targets(color).length)
        return 'Некого вернуть';
      if (stand === 'echoes' && !this.targets(color).length) return 'Нет цели';
      return '';
    }
    activate(color, target) {
      if (this.abilityBlock(color)) return false;
      const stand = this.state.stands[color];
      if (
        (stand === 'echoes' || stand === 'diamond') &&
        !this.targets(color).includes(target)
      )
        return false;
      this.#applyAbility(color, target);
      return true;
    }
    #applyAbility(color, target) {
      const s = this.state;
      const stand = s.stands[color],
        foe = other(color);
      s.mana[color] = 0;
      if (stand === 'crimson') {
        const last = s.lastMove;
        this.chess.load(passTurn(last.before, color));
        if (last.variantBefore) Object.assign(s, copy(last.variantBefore));
        s.mana[foe] -= last.manaEarned;
        s.events[last.event].erased = true;
        s.positions.pop();
        s.events.push({
          kind: 'ability',
          color,
          text: 'King Crimson',
          detail: 'Стёрт ход ' + last.san,
        });
        s.lastMove = null;
      } else if (stand === 'world') {
        s.freeze = 2;
        s.events.push({
          kind: 'ability',
          color,
          text: 'The World',
          detail: 'Время остановлено',
        });
      } else if (stand === 'echoes') {
        s.locked[foe] = target;
        s.events.push({
          kind: 'ability',
          color,
          stand,
          text: STANDS[stand].name,
          detail: 'Фигура прижата на ' + target,
          target,
        });
      } else {
        const before = this.chess.fen(),
          variantBefore = this.#variantBefore(),
          event = s.events.length;
        const index = s.fallen.findIndex(
          (f) => f.color === color && f.home === target,
        );
        const [piece] = s.fallen.splice(index, 1);
        this.chess.put({ color, type: piece.type }, target);
        s.homes[target] = target;
        s.locked[color] = null;
        const fields = this.chess.fen().split(' ');
        fields[1] = foe;
        fields[3] = '-';
        fields[4] = '0';
        if (color === 'b') fields[5] = String(Number(fields[5]) + 1);
        this.chess.load(fields.join(' '));
        s.lastMove = {
          before,
          variantBefore,
          color,
          from: null,
          to: target,
          san: 'восстановление ' + target,
          event,
          manaEarned: 0,
        };
        s.events.push({
          kind: 'ability',
          color,
          stand,
          text: STANDS[stand].name,
          detail: piece.square + ' → ' + target,
          target,
          piece: piece.type,
        });
      }
      this.record();
    }
    move(from, to, promotion) {
      if (this.result()) return null;
      if (
        this.state.locked[this.turn()] &&
        !this.moves(from).some(
          (m) => m.to === to && (!m.promotion || m.promotion === promotion),
        )
      )
        return null;
      return this.#applyMove({ from, to, promotion });
    }
    #applyMove(input) {
      const before = this.chess.fen();
      const variantBefore = this.#variantBefore();
      const m = this.chess.move(input);
      if (!m) return null;
      const s = this.state;
      const { from, to } = m;
      const foe = other(m.color);
      const death = m.flags.includes('e') ? to[0] + from[1] : to;
      if (m.captured) {
        const home = s.homes[death];
        if (home && m.captured !== 'q') {
          const king = squares.find((sq) => {
            const p = this.chess.get(sq);
            return p?.color === foe && p.type === 'k';
          });
          if (distance(king, death) <= 3)
            s.fallen.push({
              color: foe,
              type: m.captured,
              home,
              square: death,
            });
        }
        delete s.homes[death];
        if (s.locked[foe] === death) s.locked[foe] = null;
      }
      if (s.homes[from]) {
        s.homes[to] = s.homes[from];
        delete s.homes[from];
      }
      if (m.flags.includes('k') || m.flags.includes('q')) {
        const short = m.flags.includes('k'),
          rook = (short ? 'h' : 'a') + from[1];
        if (s.homes[rook]) {
          s.homes[(short ? 'f' : 'd') + from[1]] = s.homes[rook];
          delete s.homes[rook];
        }
      }
      s.locked[m.color] = null;
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
        ...(variantBefore ? { variantBefore } : {}),
      };
      if (s.freeze) {
        s.freeze--;
        // The opponent always gets a reply to check. Terminal positions end the effect.
        if (
          this.chess.in_check() ||
          this.chess.in_stalemate() ||
          (this.chess.insufficient_material() && !s.fallen.length) ||
          +this.chess.fen().split(' ')[4] >= 100
        )
          s.freeze = 0;
        if (s.freeze) {
          const extra = new Chess(passTurn(this.chess.fen(), m.color));
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
      if (s.lastMove && s.mana[s.lastMove.color] < MAX_MANA)
        s.lastMove.manaEarned = 0;
      s.mana = { w: MAX_MANA, b: MAX_MANA };
      s.events.push({ kind: 'debug', text: 'Мана восстановлена' });
      this.record();
      return true;
    }
  }
  const scenarios = {
    echoes: {
      label: 'Echoes ACT 3 · прижать коня',
      mana: MAX_MANA,
      stands: { w: 'echoes' },
      hint: 'Прижмите коня g8 и сделайте ход белыми. Конь пропустит ближайший ход чёрных.',
    },
    diamond: {
      label: 'Crazy Diamond · восстановить пешку',
      mana: MAX_MANA,
      stands: { w: 'diamond' },
      moves: [
        ['e2', 'e4'],
        ['d7', 'd5'],
        ['b1', 'c3'],
        ['d5', 'e4'],
      ],
      hint: 'Пешку взяли на e4 ровно в трёх клетках от короля e1. Верните её на e2.',
    },
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
    const game = new StandGame(spec.fen, spec.mana, spec.stands);
    for (const [from, to] of spec.moves || []) {
      if (!game.move(from, to)) throw new Error('Некорректная позиция ' + id);
    }
    return game;
  }
  const api = {
    StandGame,
    scenarios,
    scenario,
    MAX_MANA,
    STANDS,
    DEFAULT_STANDS,
  };
  root.StandChess = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
