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
        [
          'enigma',
          'gold',
          'kiss',
          'heaven',
          'house',
          'wonder',
          'dust',
          'sticky',
          'gojo',
        ].includes(id),
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
    const price = (p, c) => STANDS[p.stands[c]].cost || 100;
    const cap = (p, c) => STANDS[p.stands[c]].manaCap || price(p, c);
    const cellOf = (key) => key.slice(0, 2);
    const phased = (key) => key.length > 2;
    function phaseKey(p, square) {
      let slot = 1;
      while (p.units[square + '~' + slot]) slot++;
      return square + '~' + slot;
    }
    function settleInfinity(p) {
      if (!p.gojo) return;
      for (const color of ['w', 'b']) {
        const side = Object.entries(p.units).filter(
          ([, u]) => u.color === color && u.type !== 'k',
        );
        if (side.length === 1 && phased(side[0][0]))
          remove(p, side[0][0], true);
      }
    }
    // Earlier games allowed a transparent piece to move, attack and be taken.
    // Only the historical viewer can request that ruleset.
    const frozenBySticky = (p, piece) =>
      p.stickyRules === 2 && !!piece?.transparent;
    function branch(p) {
      return {
        ...p,
        units: { ...p.units },
        locked: { ...p.locked },
        snared: { ...p.snared },
        wonder: { w: 0, b: 0, ...p.wonder },
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
      if (frozenBySticky(p, u)) return moves;
      function add(to, flags = 'n', death) {
        const victim = p.units[death || to];
        if (
          !attacks &&
          victim &&
          (victim.color === u.color ||
            victim.type === 'k' ||
            frozenBySticky(p, victim))
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
        if (
          !attacks &&
          within(p, one, u) &&
          (!p.units[one] || p.units[one].transparent)
        ) {
          if (!p.units[one]) add(one);
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
          if (p.units[to] && !p.units[to].transparent) break;
        }
      }
      return moves;
    }
    const attacksSquare = (p, from, sq) =>
      pseudo(p, from, true).some((m) => m.to === sq);
    function attacked(p, sq, by) {
      if (!sq) return true;
      return Object.entries(p.units).some(
        ([from, u]) => u.color === by && attacksSquare(p, from, sq),
      );
    }
    function check(p, c) {
      return attacked(p, royal(p, c), other(c));
    }
    function validPosition(p, c) {
      return (
        !!royal(p, c) &&
        !check(p, c) &&
        (!p.tower ||
          Object.keys(p.units).some((s) => inTower(p.tower, s, p.towerRadius)))
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
          rookKey =
            p.units[rk] || !p.gojo
              ? rk
              : Object.keys(p.units).find(
                  (key) =>
                    cellOf(key) === rk &&
                    p.units[key].type === 'r' &&
                    p.units[key].color === c,
                ),
          rook = p.units[rookKey];
        if (
          !p.rights.includes(c === 'w' ? flag.toUpperCase() : flag) ||
          rook?.type !== 'r' ||
          rook.color !== c ||
          rook.walk ||
          frozenBySticky(p, rook) ||
          p.locked[c] === rookKey
        )
          continue;
        // King and rook destinations must be vacant. Only b can be crossed
        // without becoming a destination during long castling.
        if ([...(short ? 'fg' : 'dc')].some((f) => p.units[f + r])) continue;
        if (!short && p.units['b' + r] && !p.units['b' + r].transparent)
          continue;
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
          rook: rookKey,
          rookTo: mid,
        });
      }
      return result;
    }
    function dropRights(p, sq) {
      const right = { a1: 'Q', h1: 'K', a8: 'q', h8: 'k' }[sq];
      if (right) p.rights = p.rights.replace(right, '');
    }
    function remove(p, sq, expire = false, moving = false) {
      const u = p.units[sq];
      if (!u || (phased(sq) && !expire && !moving)) return;
      delete p.units[sq];
      dropRights(p, cellOf(sq));
      if (p.locked[u.color] === sq) p.locked[u.color] = null;
      const king = royal(p, u.color);
      if (
        !expire &&
        u.home &&
        u.type !== 'q' &&
        king &&
        distance(king, sq) <= 3
      )
        p.fallen.push({
          color: u.color,
          type: u.type,
          home: u.home,
          square: cellOf(sq),
        });
      const pair = p.links.find((l) => l.original === sq || l.clone === sq);
      if (pair) {
        p.links = p.links.filter((l) => l !== pair);
        remove(p, pair.original === sq ? pair.clone : pair.original);
      }
    }
    function slide(p, from, to, keepRights = false) {
      const u = p.units[from];
      delete p.units[from];
      p.units[to] = u;
      for (const l of p.links) {
        if (l.original === from) l.original = to;
        if (l.clone === from) l.clone = to;
      }
      if (p.locked[u.color] === from) p.locked[u.color] = to;
      if (!keepRights) dropRights(p, cellOf(from));
    }
    function merge(p, l) {
      p.links = p.links.filter((pair) => pair !== l);
      remove(p, l.clone);
    }
    function finishTurn(p, c, newLink = false, freshZip) {
      p.locked[c] = null;
      p.snared[c] = false;
      for (const l of [...p.links])
        if (l.owner === c && !newLink && --l.left === 0) merge(p, l);
      if (p.stands[c] === 'sticky')
        for (const [sq, u] of Object.entries(p.units)) {
          if (u.transparent?.caster !== c || sq === freshZip) continue;
          p.units[sq] = {
            ...u,
            transparent:
              u.transparent.turns > 1
                ? { caster: c, turns: u.transparent.turns - 1 }
                : undefined,
          };
        }
      if (p.stands[other(c)] === 'dust') {
        for (const [sq, u] of Object.entries(p.units))
          if (u.color !== c && u.dust)
            p.units[sq] = { ...u, dust: u.dust > 1 ? u.dust - 1 : undefined };
      }
      p.side = other(c);
      if (c === 'b') p.full++;
    }
    // Resolve from the completed board, including uncovered attacks and the
    // disappearance of an expired Kiss copy. Collect both attackers first.
    function resolveWonder(p, actor, completedTurn, victims) {
      const protectedSide = other(actor);
      if (!p.wonder[protectedSide]) return;
      if (completedTurn) p.wonder[protectedSide]--;
      const king = royal(p, protectedSide);
      if (!king) return;
      const checkers = Object.entries(p.units).filter(
        ([sq, u]) =>
          u.color === actor &&
          u.type !== 'k' &&
          !phased(sq) &&
          attacksSquare(p, sq, king),
      );
      if (!checkers.length) return;
      p.wonder[protectedSide] = 0;
      for (const [sq, u] of checkers) {
        victims?.push({ square: sq, type: u.walk || u.type, color: u.color });
        remove(p, sq);
        if (
          p.ep?.[0] === sq[0] &&
          u.type === 'p' &&
          Math.abs(Number(p.ep[1]) - Number(sq[1])) === 1
        )
          p.ep = null;
      }
      p.half = 0;
    }
    function addCalamity(event, victims) {
      if (victims.length)
        event.calamity = victims.map((victim) => ({
          ...victim,
          variant: Math.floor(Math.random() * 3),
        }));
    }
    function simulate(p, m, victims) {
      const n = branch(p),
        u = n.units[m.from],
        c = u.color;
      const bait = n.units[m.death];
      if (bait?.dust && u.type !== 'k') {
        m.detonation = {
          square: m.death,
          from: m.from,
          type: u.walk || u.type,
          color: c,
        };
        n.units[m.death] = { ...bait, dust: undefined };
        remove(n, m.from, false, true);
      } else if (m.death) remove(n, m.death);
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
      settleInfinity(n);
      resolveWonder(n, c, true, victims);
      settleInfinity(n);
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
    function gojoOptions(p, c, archived = false) {
      const list = [];
      if (p.gojo[c] === 2) {
        for (const f of files) {
          list.push({ target: f + '1', choice: 'purple:' + f + '8' });
          if (archived)
            list.push({ target: f + '8', choice: 'purple:' + f + '1' });
        }
        if (!archived) return list;
        for (const r of '12345678') {
          list.push(
            { target: 'a' + r, choice: 'purple:h' + r },
            { target: 'h' + r, choice: 'purple:a' + r },
          );
        }
        return list;
      }
      for (const [key, unit] of Object.entries(p.units)) {
        if (unit.type === 'k') continue;
        if (!phased(key)) list.push({ target: key, choice: 'infinity' });
        if (frozenBySticky(p, unit)) continue;
        const own = unit.color === c,
          length = own ? 2 : 1;
        for (const [dx, dy] of adjacent) {
          const dest = step(key, dx * length, dy * length);
          if (within(p, dest, unit) && !p.units[dest])
            list.push({ target: key, choice: (own ? 'red:' : 'blue:') + dest });
        }
      }
      return list;
    }
    function purpleBand(start, end) {
      const vertical = start[0] === end[0];
      const dx = vertical
        ? 0
        : Math.sign(end.charCodeAt(0) - start.charCodeAt(0));
      const dy = vertical ? Math.sign(Number(end[1]) - Number(start[1])) : 0;
      const offsetX = vertical ? (start[0] === 'h' ? -1 : 1) : 0;
      const offsetY = vertical ? 0 : start[1] === '8' ? -1 : 1;
      const first = Array.from({ length: 8 }, (_, i) =>
        step(start, i * dx, i * dy),
      );
      return first.concat(first.map((sq) => step(sq, offsetX, offsetY)));
    }
    function options(p, c) {
      const id = p.stands[c],
        list = [];
      if (id === 'gojo') return gojoOptions(p, c);
      if (id === 'diamond')
        return p.fallen
          .filter((f) => f.color === c && !p.units[f.home])
          .map((f) => ({ target: f.home }));
      for (const [sq, u] of Object.entries(p.units)) {
        if (id === 'dust' && u.color === c && u.type !== 'k')
          list.push({ target: sq });
        if (id === 'sticky' && u.type !== 'k') list.push({ target: sq });
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
    function applyChoice(
      p,
      c,
      { target, choice },
      victims,
      legacyPurple = false,
    ) {
      const n = branch(p),
        id = p.stands[c],
        u = n.units[target];
      if (id === 'gojo') {
        n.gojo = { ...p.gojo, [c]: (p.gojo[c] + 1) % 3 };
        const [technique, dest] = choice.split(':');
        if (technique === 'infinity') {
          slide(n, target, phaseKey(n, target), true);
          if (
            p.ep &&
            p.ep[0] === target[0] &&
            Math.abs(p.ep[1] - target[1]) === 1 &&
            u.type === 'p'
          )
            n.ep = null;
          settleInfinity(n);
          return n;
        }
        if (technique === 'purple') {
          const band = new Set(purpleBand(target, dest));
          for (const [sq, piece] of Object.entries(n.units))
            if (
              piece.type !== 'k' &&
              !phased(sq) &&
              (legacyPurple
                ? (target[0] === dest[0]
                    ? Math.abs(sq.charCodeAt(0) - target.charCodeAt(0))
                    : Math.abs(Number(sq[1]) - Number(target[1]))) <= 2
                : band.has(sq))
            )
              remove(n, sq);
        } else {
          const landing = phased(target) ? phaseKey(n, dest) : dest;
          slide(n, target, landing);
          if (u.type === 'p' && dest[1] === (u.color === 'w' ? '8' : '1'))
            n.units[landing] = { ...u, type: 'q', walk: undefined };
          if (check(n, other(c))) return null;
        }
      }
      if (id === 'dust') {
        for (const [sq, piece] of Object.entries(n.units))
          if (piece.color === c && piece.dust)
            n.units[sq] = { ...piece, dust: undefined };
        n.units[target] = { ...u, dust: 3 };
        return n;
      }
      if (id === 'echoes') {
        n.locked[other(c)] = target;
        return n;
      }
      if (id === 'gold')
        n.units[target] = { ...u, type: choice, walk: undefined };
      if (id === 'sticky')
        n.units[target] = { ...u, transparent: { caster: c, turns: 2 } };
      if (id === 'heaven')
        n.units[target] = {
          ...u,
          walk: choice === u.type ? undefined : choice,
        };
      if (id === 'kiss') {
        n.units[choice] = {
          ...u,
          home: undefined,
          transparent: undefined,
          dust: undefined,
        };
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
      finishTurn(n, c, id === 'kiss', id === 'sticky' ? target : null);
      settleInfinity(n);
      resolveWonder(n, c, true, victims);
      settleInfinity(n);
      return n;
    }
    function signature(p) {
      const board = Object.entries(p.units)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sq, u]) => [
          sq,
          u.color,
          u.type,
          u.walk || '',
          u.home || '',
          ...(u.transparent ? [u.transparent] : []),
          ...(u.dust ? [{ dust: u.dust }] : []),
        ]);
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
        ...(p.wonder?.w || p.wonder?.b ? [p.wonder] : []),
        ...(p.gojo ? [p.gojo] : []),
      ];
    }
    function validChoice(p, c, option, mana) {
      const id = p.stands[c];
      if (id === 'echoes' || id === 'dust') return true;
      const next = applyChoice(p, c, option);
      if (!next || !validPosition(next, c)) return false;
      if (id !== 'gojo') return true;
      if (option.choice === 'infinity') {
        if (legal(next, null, true).length) return true;
        const remaining = mana - price(p, c);
        return (
          remaining >= price(p, c) &&
          gojoOptions(next, c).some((o) => validChoice(next, c, o, remaining))
        );
      }
      return option.choice.startsWith('purple:') || !check(next, other(c));
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
      constructor(
        fenText,
        mana = 0,
        stands,
        tower,
        towerRadius,
        stickyRules = 2,
      ) {
        const base = new Base(
          fenText,
          Math.min(100, mana),
          stands,
          tower,
          towerRadius,
        );
        const s = (this.state = base.state),
          fields = s.fen.split(' ');
        const p = (s.position = {
          units: {},
          stands: s.stands,
          tower: s.tower,
          towerRadius: s.towerRadius,
          side: fields[1],
          rights: fields[2].replace('-', ''),
          ep: fields[3] === '-' ? null : fields[3],
          half: +fields[4],
          full: +fields[5],
          locked: { w: null, b: null },
          snared: { w: false, b: false },
          wonder: { w: 0, b: 0 },
          links: [],
          fallen: [],
        });
        if (Object.values(s.stands).includes('sticky')) {
          p.stickyRules = stickyRules;
          s.stickyRulesFrom = 0;
        }
        if (Object.values(s.stands).includes('gojo')) p.gojo = { w: 0, b: 0 };
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
          get: (sq) =>
            this.p.units[sq] ||
            (this.p.gojo && this.p.units[this.pieceKeys(sq)[0]]) ||
            null,
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
        g.state.towerRadius ??= g.state.tower ? 3 : 1;
        g.state.position.towerRadius = g.state.towerRadius;
        if (g.state.lastMove?.previous)
          g.state.lastMove.previous.towerRadius = g.state.towerRadius;
        g.attach();
        if (Object.values(g.p.stands).includes('sticky')) {
          g.state.stickyRulesFrom ??= g.state.events.length;
          g.useCurrentStickyRules();
        }
        return g;
      }
      useCurrentStickyRules() {
        this.p.stickyRules = 2;
        if (this.state.lastMove?.previous)
          this.state.lastMove.previous.stickyRules = 2;
        this.cache.clear();
      }
      moves(sq) {
        if (this.state.legalMoves)
          return this.state.legalMoves.filter(
            (m) =>
              !sq ||
              m.from === sq ||
              (this.p.gojo && !this.p.units[sq] && cellOf(m.from) === sq),
          );
        if (sq && this.p.gojo && !this.p.units[sq] && sq.length === 2)
          return this.pieceKeys(sq).flatMap((key) => legal(this.p, key));
        return legal(this.p, sq);
      }
      pieceKeys(square) {
        return Object.keys(this.p.units)
          .filter((key) => cellOf(key) === square)
          .sort();
      }
      towerOccupants() {
        return this.p.tower
          ? Object.keys(this.p.units).filter((s) =>
              inTower(this.p.tower, s, this.p.towerRadius),
            )
          : [];
      }
      choices(c) {
        if (!this.cache.has(c))
          this.cache.set(
            c,
            options(this.p, c).filter((o) =>
              validChoice(this.p, c, o, this.state.mana[c]),
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
      mergedPosition(c, victims) {
        const n = branch(this.p),
          l = n.links.find((l) => l.owner === c);
        if (!l) return null;
        merge(n, l);
        settleInfinity(n);
        // A free merge can reveal a checking line even between turns.
        if (n.wonder[other(c)] && !check(this.p, other(c)))
          resolveWonder(n, c, false, victims);
        settleInfinity(n);
        return n;
      }
      canMerge(c) {
        const n = this.mergedPosition(c);
        if (!n) return false;
        if (validPosition(n, c)) return true;
        return (
          c === n.side &&
          check(this.p, c) &&
          (!n.tower ||
            Object.keys(n.units).some((s) =>
              inTower(n.tower, s, n.towerRadius),
            )) &&
          !!legal(n, null, true).length
        );
      }
      merge(c) {
        if (this.result() || !this.canMerge(c)) return false;
        const victims = [],
          n = this.mergedPosition(c, victims),
          l = this.p.links.find((l) => l.owner === c);
        this.state.position = n;
        const event = {
          kind: 'merge',
          stand: 'kiss',
          color: c,
          text: 'Kiss',
          detail: 'Наклейка снята',
          target: l.original,
        };
        addCalamity(event, victims);
        this.state.events.push(event);
        this.record();
        return true;
      }
      result() {
        if (this.state.verdict !== undefined) return this.state.verdict;
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
              (s.mana[c] >= price(p, c) &&
                [
                  'gold',
                  'heaven',
                  'diamond',
                  'kiss',
                  'sticky',
                  'gojo',
                ].includes(id) &&
                this.choices(c).length));
          let mergeEscape = false;
          if (this.canMerge(c)) {
            const n = this.mergedPosition(c);
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
      abilityBlock(c, selecting = true) {
        const s = this.state,
          id = this.p.stands[c];
        if (['house', 'superfly'].includes(id)) return 'Пассивный стенд';
        if (this.result()) return 'Партия завершена';
        if (s.freeze) return 'Время остановлено';
        if (s.mana[c] < price(this.p, c))
          return 'Нужно ' + price(this.p, c) + ' маны';
        if (this.turn() !== c) return 'В свой ход';
        if (id === 'crimson' && !this.canRewind(c)) return 'Нельзя стереть ход';
        if (
          [
            'gold',
            'heaven',
            'kiss',
            'diamond',
            'echoes',
            'sticky',
            'dust',
            'gojo',
          ].includes(id) &&
          (id !== 'gojo' || selecting) &&
          !this.choices(c).length
        )
          return 'Нет доступной цели';
        return '';
      }
      activate(c, target, choice, archivedWidth = 0) {
        if (
          archivedWidth
            ? this.p.stands[c] !== 'gojo' ||
              this.turn() !== c ||
              this.state.freeze ||
              this.state.mana[c] < 50 ||
              !choice?.startsWith('purple:')
            : this.abilityBlock(c, false)
        )
          return false;
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
        else if (id === 'wonder') {
          s.position = branch(p);
          s.position.wonder[c] = 3;
          event.detail = 'Защита на три хода соперника';
        } else if (id === 'enigma') {
          s.position = branch(p);
          s.position.snared[other(c)] = true;
          event.detail = 'Ловушка на следующий ход';
        } else {
          const direct = id === 'gojo' && (archivedWidth || !this.cache.has(c));
          const opt = (
            direct ? gojoOptions(p, c, !!archivedWidth) : this.choices(c)
          ).find((o) => o.target === target && o.choice === choice);
          if (
            !opt ||
            (direct && !archivedWidth && !validChoice(p, c, opt, s.mana[c]))
          )
            return false;
          const victims = [];
          s.position = applyChoice(p, c, opt, victims, archivedWidth === 5);
          addCalamity(event, victims);
          event.piece = s.position.units[target]?.type;
          event.detail =
            id === 'dust'
              ? 'Третья бомба взведена'
              : target + (choice ? ' → ' + choice : '');
          if (id === 'gojo') {
            const [mode, dest] = choice.split(':');
            const names = {
              infinity: 'Бесконечность',
              red: 'Красный',
              blue: 'Синий',
              purple: 'Фиолетовый',
            };
            event.text = names[mode];
            event.detail = cellOf(target) + (dest ? ' → ' + dest : '');
            if (mode === 'purple') {
              if (archivedWidth !== 5) event.width = 2;
              event.victims = Object.entries(p.units)
                .filter(([key]) => !s.position.units[key])
                .map(([key, u]) => ({
                  square: cellOf(key),
                  type: u.walk || u.type,
                  color: u.color,
                }));
            }
            if (mode === 'blue' || mode === 'red')
              event.displaced = {
                color: p.units[target].color,
                type: p.units[target].walk || p.units[target].type,
              };
          }
          if (
            !['echoes', 'dust'].includes(id) &&
            !(id === 'gojo' && choice === 'infinity')
          )
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
        s.mana[c] -= price(p, c);
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
        from = m.from;
        const p = this.p,
          s = this.state,
          c = p.side,
          victims = [],
          n = simulate(p, m, victims);
        addCalamity(m, victims);
        if (m.shot && p.units[from].walk) m.walk = p.units[from].walk;
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
                cellOf(from) +
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
      static purpleBand = purpleBand;
      constructor(fen, mana, stands, tower, towerRadius, stickyRules) {
        if (advanced(stands))
          return new ExtendedGame(
            fen,
            mana,
            stands,
            tower,
            towerRadius,
            stickyRules,
          );
        super(fen, mana, stands, tower, towerRadius);
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
