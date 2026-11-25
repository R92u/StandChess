// Shared by the server and browser. Every candidate is tested on its resulting position.
(function (root) {
  'use strict';
  const factory = ({ Base, other, distance, copy, inTower, STANDS }) => {
    const extra = ['i3', 'i4', 'i5'];
    const files = 'abcdefgh';
    const standard = [...files].flatMap((f) =>
      [...'12345678'].map((r) => f + r),
    );
    const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ],
      diag = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ];
    const adjacent = [...dirs, ...diag],
      knights = [
        [1, 2],
        [2, 1],
        [-1, 2],
        [-2, 1],
        [1, -2],
        [2, -1],
        [-1, -2],
        [-2, -1],
      ];
    const step = (sq, dx, dy) =>
      String.fromCharCode(sq.charCodeAt(0) + dx) + (Number(sq[1]) + dy);
    const advanced = (stands) =>
      Object.values(stands || {}).some((id) =>
        ['enigma', 'gold', 'kiss', 'heaven', 'house'].includes(id),
      );
    const royal = (p, c) =>
      Object.keys(p.units).find(
        (s) => p.units[s].type === 'k' && p.units[s].color === c,
      );
    const within = (p, s, piece) =>
      standard.includes(s) ||
      (extra.includes(s) &&
        p.stands[piece.color] === 'house' &&
        piece.type !== 'k');
    const cap = (p, c) => STANDS[p.stands[c]].cost || 100;
    function branch(p) {
      return {
        ...p,
        units: { ...p.units },
        locked: { ...p.locked },
        snared: { ...p.snared },
        links: p.links.map((l) => ({ ...l })),
        fallen: [...p.fallen],
      };
    }
    function fen(p) {
      const rows = [];
      for (let r = 8; r >= 1; r--) {
        let row = '',
          empty = 0;
        for (const f of files) {
          const u = p.units[f + r];
          if (!u) {
            empty++;
            continue;
          }
          if (empty) {
            row += empty;
            empty = 0;
          }
          row += u.color === 'w' ? u.type.toUpperCase() : u.type;
        }
        rows.push(row + (empty || ''));
      }
      return [
        rows.join('/'),
        p.side,
        p.rights || '-',
        p.ep || '-',
        p.half,
        p.full,
      ].join(' ');
    }
    function pseudo(p, from, attacks = false) {
      const u = p.units[from],
        moves = [],
        kind = u.walk || u.type,
        dir = u.color === 'w' ? 1 : -1;
      function add(to, flags = 'n', death) {
        const victim = p.units[death || to];
        if (
          !attacks &&
          victim &&
          (victim.color === u.color || victim.type === 'k')
        )
          return;
        const m = {
          from,
          to,
          piece: u.type,
          color: u.color,
          flags: death ? 'e' : victim ? 'c' : flags,
          captured: victim?.type,
          death: death || (victim ? to : null),
        };
        if (
          !attacks &&
          u.type === 'p' &&
          to[1] === (u.color === 'w' ? '8' : '1')
        )
          for (const promotion of 'qrbn') moves.push({ ...m, promotion });
        else moves.push(m);
      }
      if (kind === 'p') {
        for (const dx of [-1, 1]) {
          const to = step(from, dx, dir);
          if (!within(p, to, u)) continue;
          if (attacks || p.units[to]) add(to);
          else if (
            to === p.ep &&
            p.units[to[0] + from[1]]?.color === other(u.color) &&
            (p.units[to[0] + from[1]].walk || p.units[to[0] + from[1]].type) ===
              'p'
          )
            add(to, 'e', to[0] + from[1]);
        }
        const one = step(from, 0, dir),
          two = step(one, 0, dir);
        if (!attacks && within(p, one, u) && !p.units[one]) {
          add(one);
          if (
            from[1] === (u.color === 'w' ? '2' : '7') &&
            within(p, two, u) &&
            !p.units[two]
          )
            add(two, 'b');
        }
        return moves;
      }
      const vectors =
        kind === 'n'
          ? knights
          : kind === 'b'
            ? diag
            : kind === 'r'
              ? dirs
              : adjacent;
      const range = 'brq'.includes(kind) ? 8 : 1;
      for (const [dx, dy] of vectors) {
        let to = from;
        for (let i = 0; i < range; i++) {
          to = step(to, dx, dy);
          if (!within(p, to, u)) break;
          add(to);
          if (p.units[to]) break;
        }
      }
      return moves;
    }
    function attacked(p, sq, by) {
      if (!sq) return true;
      return Object.entries(p.units).some(
        ([from, u]) =>
          u.color === by && pseudo(p, from, true).some((m) => m.to === sq),
      );
    }
    function check(p, c) {
      return attacked(p, royal(p, c), other(c));
    }
    function validPosition(p, c) {
      return (
        !!royal(p, c) &&
        !check(p, c) &&
        (!p.tower || Object.keys(p.units).some((s) => inTower(p.tower, s)))
      );
    }
    function castles(p, from) {
      const c = p.side,
        r = c === 'w' ? '1' : '8',
        u = p.units[from];
      if (from !== 'e' + r || u.type !== 'k' || check(p, c)) return [];
      const result = [];
      for (const short of [true, false]) {
        const flag = short ? 'k' : 'q',
          rk = (short ? 'h' : 'a') + r,
          rook = p.units[rk];
        if (
          !p.rights.includes(c === 'w' ? flag.toUpperCase() : flag) ||
          rook?.type !== 'r' ||
          rook.color !== c ||
          rook.walk ||
          p.locked[c] === rk
        )
          continue;
        if ([...(short ? 'fg' : 'dcb')].some((f) => p.units[f + r])) continue;
        const mid = (short ? 'f' : 'd') + r,
          through = branch(p);
        delete through.units[from];
        through.units[mid] = u;
        if (check(through, c)) continue;
        result.push({
          color: c,
          from,
          to: (short ? 'g' : 'c') + r,
          flags: flag,
          piece: 'k',
          rook: rk,
          rookTo: mid,
        });
      }
      return result;
    }
    function dropRights(p, sq) {
      const right = { a1: 'Q', h1: 'K', a8: 'q', h8: 'k' }[sq];
      if (right) p.rights = p.rights.replace(right, '');
    }
    function remove(p, sq) {
      const u = p.units[sq];
      if (!u) return;
      delete p.units[sq];
      dropRights(p, sq);
      if (p.locked[u.color] === sq) p.locked[u.color] = null;
      const king = royal(p, u.color);
      if (u.home && u.type !== 'q' && king && distance(king, sq) <= 3)
        p.fallen.push({
          color: u.color,
          type: u.type,
          home: u.home,
          square: sq,
        });
      const pair = p.links.find((l) => l.original === sq || l.clone === sq);
      if (pair) {
        p.links = p.links.filter((l) => l !== pair);
        remove(p, pair.original === sq ? pair.clone : pair.original);
      }
    }
    function slide(p, from, to) {
      const u = p.units[from];
      delete p.units[from];
      p.units[to] = u;
      for (const l of p.links) {
        if (l.original === from) l.original = to;
        if (l.clone === from) l.clone = to;
      }
      if (p.locked[u.color] === from) p.locked[u.color] = to;
      dropRights(p, from);
    }
    function merge(p, l) {
      p.links = p.links.filter((pair) => pair !== l);
      remove(p, l.clone);
    }
    function finishTurn(p, c, newLink = false) {
      p.locked[c] = null;
      p.snared[c] = false;
      for (const l of [...p.links])
        if (l.owner === c && !newLink && --l.left === 0) merge(p, l);
      p.side = other(c);
      if (c === 'b') p.full++;
    }
    function simulate(p, m) {
      const n = branch(p),
        u = n.units[m.from],
        c = u.color;
      if (m.death) remove(n, m.death);
      // A capture may destroy the moving piece through a Kiss link.
      if (n.units[m.from]) {
        slide(n, m.from, m.to);
        if (m.promotion) n.units[m.to] = { ...u, type: m.promotion };
        if (m.rook) slide(n, m.rook, m.rookTo);
        if (p.snared[c] && (m.to[1] - m.from[1]) * (c === 'w' ? 1 : -1) < 0)
          remove(n, m.to);
      }
      if (u.type === 'k')
        n.rights = n.rights.replace(c === 'w' ? /[KQ]/g : /[kq]/g, '');
      n.ep = m.flags === 'b' ? step(m.from, 0, c === 'w' ? 1 : -1) : null;
      n.half = u.type === 'p' || m.death || !n.units[m.to] ? 0 : p.half + 1;
      finishTurn(n, c);
      return n;
    }
    function legal(p, from, first = false) {
      const found = [];
      for (const sq of from ? [from] : Object.keys(p.units)) {
        const u = p.units[sq];
        if (!u || u.color !== p.side || p.locked[p.side] === sq) continue;
        const candidates = pseudo(p, sq);
        if (u.type === 'k') candidates.push(...castles(p, sq));
        for (const m of candidates) {
          const n = simulate(p, m);
          if (!validPosition(n, p.side)) continue;
          m.shot =
            !!p.snared[p.side] &&
            (m.to[1] - m.from[1]) * (p.side === 'w' ? 1 : -1) < 0;
          found.push(m);
          if (first) return found;
        }
      }
      return found;
    }
    function options(p, c) {
      const id = p.stands[c],
        list = [];
      if (id === 'diamond')
        return p.fallen
          .filter((f) => f.color === c && !p.units[f.home])
          .map((f) => ({ target: f.home }));
      for (const [sq, u] of Object.entries(p.units)) {
        if (id === 'echoes' && u.color !== c && u.type !== 'k')
          list.push({ target: sq });
        if (id === 'gold' && u.color === c && u.type === 'p')
          for (const choice of 'nbr') list.push({ target: sq, choice });
        if (
          id === 'heaven' &&
          !'kq'.includes(u.type) &&
          distance(royal(p, c), sq) <= 3
        )
          for (const choice of 'pnbrqk')
            if (choice !== (u.walk || u.type))
              list.push({ target: sq, choice });
        if (
          id === 'kiss' &&
          u.color === c &&
          !'kq'.includes(u.type) &&
          !p.links.some(
            (l) => l.owner === c || l.clone === sq || l.original === sq,
          )
        ) {
          for (const [dx, dy] of adjacent) {
            const choice = step(sq, dx, dy);
            if (within(p, choice, u) && !p.units[choice])
              list.push({ target: sq, choice });
          }
        }
      }
      return list;
    }
    function applyChoice(p, c, { target, choice }) {
      const n = branch(p),
        id = p.stands[c],
        u = n.units[target];
      if (id === 'echoes') {
        n.locked[other(c)] = target;
        return n;
      }
      if (id === 'gold')
        n.units[target] = { ...u, type: choice, walk: undefined };
      if (id === 'heaven')
        n.units[target] = {
          ...u,
          walk: choice === u.type ? undefined : choice,
        };
      if (id === 'kiss') {
        n.units[choice] = { ...u, home: undefined };
        n.links.push({ original: target, clone: choice, owner: c, left: 2 });
      }
      if (id === 'diamond') {
        const index = n.fallen.findIndex(
          (f) => f.color === c && f.home === target,
        );
        const [f] = n.fallen.splice(index, 1);
        n.units[target] = { type: f.type, color: c, home: target };
      }
      n.ep = null;
      n.half = 0;
      finishTurn(n, c, id === 'kiss');
      return n;
    }
    function signature(p) {
      const board = Object.entries(p.units)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sq, u]) => [sq, u.color, u.type, u.walk || '', u.home || '']);
      const ep = p.ep && legal(p).some((m) => m.flags === 'e') ? p.ep : null;
      return [
        board,
        p.side,
        p.rights,
        ep,
        p.locked,
        p.snared,
        [...p.links].sort((a, b) => a.owner.localeCompare(b.owner)),
        p.fallen,
        p.stands,
        p.tower,
      ];
    }
    function changeSide(p, side) {
      if (p.side === side) return p;
      return {
        ...p,
        side,
        ep: null,
        full: Math.max(1, p.full + (p.side === 'b' ? 1 : -1)),
      };
    }
    class ExtendedGame {
      constructor(fenText, mana = 0, stands, tower) {
        const base = new Base(fenText, Math.min(100, mana), stands, tower);
        const s = (this.state = base.state),
          fields = s.fen.split(' ');
        const p = (s.position = {
          units: {},
          stands: s.stands,
          tower: s.tower,
          side: fields[1],
          rights: fields[2].replace('-', ''),
          ep: fields[3] === '-' ? null : fields[3],
          half: +fields[4],
          full: +fields[5],
          locked: { w: null, b: null },
          snared: { w: false, b: false },
          links: [],
          fallen: [],
        });
        for (const sq of standard) {
          const u = base.chess.get(sq);
          if (u) p.units[sq] = { ...u, ...(s.homes[sq] ? { home: sq } : {}) };
        }
        s.mana = {
          w: Math.min(mana, cap(p, 'w')),
          b: Math.min(mana, cap(p, 'b')),
        };
        s.positions = [];
        this.attach();
        this.record();
      }
      attach() {
        this.chess = {
          get: (sq) => this.p.units[sq] || null,
          in_check: () => check(this.p, this.turn()),
          turn: () => this.turn(),
          fen: () => fen(this.p),
        };
        this.cache = new Map();
      }
      get p() {
        return this.state.position;
      }
      turn() {
        return this.p.side;
      }
      snapshot() {
        return copy(this.state);
      }
      static restore(data) {
        if (!data?.position?.units || !data.positions?.length)
          throw Error('Повреждённая позиция');
        const g = Object.create(this.prototype);
        g.state = copy(data);
        g.attach();
        return g;
      }
      moves(sq) {
        return legal(this.p, sq);
      }
      towerOccupants() {
        return this.p.tower
          ? Object.keys(this.p.units).filter((s) => inTower(this.p.tower, s))
          : [];
      }
      choices(c) {
        if (!this.cache.has(c))
          this.cache.set(
            c,
            options(this.p, c).filter(
              (o) =>
                this.p.stands[c] === 'echoes' ||
                validPosition(applyChoice(this.p, c, o), c),
            ),
          );
        return this.cache.get(c);
      }
      targets(c) {
        return [...new Set(this.choices(c).map((o) => o.target))];
      }
      record() {
        this.cache.clear();
        const s = this.state,
          p = this.p;
        s.fen = fen(p);
        s.locked = { ...p.locked };
        s.fallen = [...p.fallen];
        s.positions.push(
          JSON.stringify([
            signature(p),
            s.mana,
            s.freeze,
            this.canRewind(p.side) ? signature(s.lastMove.previous) : null,
          ]),
        );
      }
      canRewind(c) {
        const s = this.state,
          l = s.lastMove;
        return !!(
          this.p.stands[c] === 'crimson' &&
          s.mana[c] >= 100 &&
          l?.previous &&
          l.color !== c &&
          !check(l.previous, l.color) &&
          validPosition(l.previous, c)
        );
      }
      canMerge(c) {
        const n = branch(this.p),
          l = n.links.find((l) => l.owner === c);
        if (!l) return false;
        merge(n, l);
        if (validPosition(n, c)) return true;
        return (
          c === n.side &&
          check(this.p, c) &&
          (!n.tower || Object.keys(n.units).some((s) => inTower(n.tower, s))) &&
          !!legal(n, null, true).length
        );
      }
      merge(c) {
        if (this.result() || !this.canMerge(c)) return false;
        const n = branch(this.p),
          l = n.links.find((l) => l.owner === c);
        merge(n, l);
        this.state.position = n;
        this.state.events.push({
          kind: 'merge',
          stand: 'kiss',
          color: c,
          text: 'Kiss',
          detail: 'Наклейка снята',
          target: l.original,
        });
        this.record();
        return true;
      }
      result() {
        if (this.cache.has('result')) return this.cache.get('result');
        const p = this.p,
          s = this.state,
          c = p.side,
          id = p.stands[c];
        let verdict = '';
        if (!legal(p, null, true).length) {
          const safePower =
            !s.freeze &&
            ((this.canRewind(c) &&
              legal(changeSide(s.lastMove.previous, c), null, true).length) ||
              (s.mana[c] >= cap(p, c) &&
                ['gold', 'heaven', 'diamond', 'kiss'].includes(id) &&
                this.choices(c).length));
          let mergeEscape = false;
          if (this.canMerge(c)) {
            const n = branch(p);
            merge(
              n,
              n.links.find((l) => l.owner === c),
            );
            mergeEscape = !!legal(n, null, true).length;
          }
          if (!safePower && !mergeEscape)
            verdict = check(p, c)
              ? c === 'w'
                ? 'Мат. Победа чёрных'
                : 'Мат. Победа белых'
              : 'Ничья · пат';
        }
        if (
          !verdict &&
          Object.values(p.units).every((u) => u.type === 'k') &&
          !p.fallen.length
        )
          verdict = 'Ничья · недостаточно фигур';
        if (!verdict && p.half >= 100) verdict = 'Ничья · правило 50 ходов';
        if (
          !verdict &&
          s.positions.filter((k) => k === s.positions.at(-1)).length >= 3
        )
          verdict = 'Ничья · повторение позиции';
        this.cache.set('result', verdict);
        return verdict;
      }
      abilityBlock(c) {
        const s = this.state,
          id = this.p.stands[c];
        if (['house', 'superfly'].includes(id)) return 'Пассивный стенд';
        if (this.result()) return 'Партия завершена';
        if (s.freeze) return 'Время остановлено';
        if (s.mana[c] < cap(this.p, c))
          return 'Нужно ' + cap(this.p, c) + ' маны';
        if (this.turn() !== c) return 'В свой ход';
        if (id === 'crimson' && !this.canRewind(c)) return 'Нельзя стереть ход';
        if (
          ['gold', 'heaven', 'kiss', 'diamond', 'echoes'].includes(id) &&
          !this.choices(c).length
        )
          return 'Нет доступной цели';
        return '';
      }
      activate(c, target, choice) {
        if (this.abilityBlock(c)) return false;
        const s = this.state,
          p = this.p,
          id = p.stands[c],
          i = s.events.length;
        const event = {
          kind: 'ability',
          color: c,
          stand: id,
          text: STANDS[id].name,
          target,
          choice,
        };
        if (id === 'crimson') {
          const l = s.lastMove;
          s.position = changeSide(copy(l.previous), c);
          s.mana[l.color] -= l.manaEarned;
          s.events[l.event].erased = true;
          s.lastMove = null;
          s.positions.pop();
        } else if (id === 'world') s.freeze = 2;
        else if (id === 'enigma') {
          s.position = branch(p);
          s.position.snared[other(c)] = true;
          event.detail = 'Ловушка на следующий ход';
        } else {
          const opt = this.choices(c).find(
            (o) => o.target === target && o.choice === choice,
          );
          if (!opt) return false;
          s.position = applyChoice(p, c, opt);
          event.piece = s.position.units[target]?.type;
          event.detail = target + (choice ? ' → ' + choice : '');
          if (id !== 'echoes')
            s.lastMove = {
              previous: p,
              before: fen(p),
              color: c,
              event: i,
              manaEarned: 0,
              from: null,
              to: target,
              san: STANDS[id].name,
            };
        }
        s.mana[c] -= cap(p, c);
        s.events.push(event);
        this.record();
        return true;
      }
      move(from, to, promotion) {
        if (this.result()) return null;
        const m = this.moves(from).find(
          (m) => m.to === to && m.promotion === promotion,
        );
        if (!m) return null;
        const p = this.p,
          s = this.state,
          c = p.side,
          n = simulate(p, m);
        s.position = n;
        if (s.freeze) {
          s.freeze--;
          if (check(n, n.side) || !legal(n, null, true).length || n.half >= 100)
            s.freeze = 0;
          if (s.freeze) {
            const again = changeSide(n, c);
            if (legal(again, null, true).length) s.position = again;
            else s.freeze = 0;
          }
        }
        const manaEarned = Math.min(10, cap(p, c) - s.mana[c]);
        s.mana[c] += manaEarned;
        const san =
          m.flags === 'k'
            ? 'O-O'
            : m.flags === 'q'
              ? 'O-O-O'
              : (m.piece === 'p' ? '' : m.piece.toUpperCase()) +
                from +
                (m.captured ? '×' : '–') +
                to +
                (promotion ? '=' + promotion.toUpperCase() : '');
        m.san = san + (check(s.position, other(c)) ? '+' : '');
        s.lastMove = {
          previous: p,
          before: fen(p),
          color: c,
          from,
          to,
          san: m.san,
          event: s.events.length,
          manaEarned,
        };
        s.events.push({ ...m, kind: 'move' });
        this.record();
        return m;
      }
      canRecharge() {
        return (
          !this.state.freeze &&
          ['w', 'b'].some((c) => this.state.mana[c] < cap(this.p, c))
        );
      }
      recharge() {
        if (!this.canRecharge()) return false;
        const s = this.state;
        if (
          s.lastMove &&
          s.mana[s.lastMove.color] < cap(this.p, s.lastMove.color)
        )
          s.lastMove.manaEarned = 0;
        for (const c of ['w', 'b']) s.mana[c] = cap(this.p, c);
        s.events.push({ kind: 'debug', text: 'Мана восстановлена' });
        this.record();
        return true;
      }
    }
    class Match extends Base {
      constructor(fen, mana, stands, tower) {
        if (advanced(stands)) return new ExtendedGame(fen, mana, stands, tower);
        super(fen, mana, stands, tower);
      }
      static restore(data) {
        return advanced(data?.stands)
          ? ExtendedGame.restore(data)
          : Base.restore(data);
      }
    }
    return Match;
  };
  if (typeof module !== 'undefined') module.exports = factory;
  else root.createStandVariant = factory;
})(globalThis);
