/* White-positive estimates in pawns. The game engine decides all terminal positions. */
(function (root) {
  'use strict';
  const { StandGame, STANDS, inTower } = root.StandChess || require('./engine');
  const values = { p: 1, n: 3.2, b: 3.3, r: 5, q: 9, k: 0 };
  const pieceNames = {
    p: 'пешка',
    n: 'конь',
    b: 'слон',
    r: 'ладья',
    q: 'ферзь',
    k: 'король',
  };
  const sides = ['w', 'b'],
    sign = (c) => (c === 'w' ? 1 : -1);
  const squares = [...'abcdefgh'].flatMap((f) =>
    [...'12345678'].map((r) => f + r),
  );
  function balance(game, verdict = game.result()) {
    if (verdict) return verdict.startsWith('Мат') ? -32 * sign(game.turn()) : 0;
    const s = game.state,
      p = s.position;
    const units = p
      ? Object.entries(p.units)
      : squares.map((q) => [q, game.chess.get(q)]).filter(([, u]) => u);
    const clones = new Map((p?.links || []).map((l) => [l.clone, l]));
    const trapped = s.tower
      ? units.filter(([q]) => inTower(s.tower, q, s.towerRadius))
      : [];
    let score = 0;
    const board = new Map(units);
    const loose = { w: 0, b: 0 };
    function hits(from, attacker, to) {
      if (from === to || (attacker.transparent && p?.stickyRules !== 1))
        return false;
      if (
        to[0] === 'i' &&
        (s.stands[attacker.color] !== 'house' || attacker.type === 'k')
      )
        return false;
      const dx = to.charCodeAt(0) - from.charCodeAt(0),
        dy = Number(to[1]) - Number(from[1]);
      const kind = attacker.walk || attacker.type;
      if (kind === 'p')
        return Math.abs(dx) === 1 && dy === sign(attacker.color);
      if (kind === 'n') return Math.abs(dx * dy) === 2;
      if (kind === 'k') return Math.max(Math.abs(dx), Math.abs(dy)) === 1;
      const diagonal = Math.abs(dx) === Math.abs(dy);
      if (
        (dx && dy && !diagonal) ||
        (kind === 'b' && !diagonal) ||
        (kind === 'r' && diagonal)
      )
        return false;
      for (let i = 1; i < Math.max(Math.abs(dx), Math.abs(dy)); i++) {
        const sq =
          String.fromCharCode(from.charCodeAt(0) + Math.sign(dx) * i) +
          (Number(from[1]) + Math.sign(dy) * i);
        if (board.has(sq) && !board.get(sq).transparent) return false;
      }
      return true;
    }
    for (const [sq, u] of units) {
      const kind = u.walk || u.type;
      const x = sq.charCodeAt(0) - 97,
        y = Number(sq[1]) - 1;
      const advance = u.color === 'w' ? y : 7 - y;
      const center = 3.5 - (Math.abs(3.5 - x) + Math.abs(3.5 - y)) / 2;
      let worth = u.type === 'k' ? 0 : values[kind] || 2.7;
      if (clones.has(sq)) worth *= 0.28 + 0.12 * clones.get(sq).left;
      if (u.type !== 'k') {
        worth +=
          kind === 'p'
            ? 0.075 * (advance - 1) + 0.13 * Math.max(0, advance - 3) ** 2
            : 0;
        worth += center * (kind === 'n' || kind === 'b' ? 0.12 : 0.035);
        if (s.locked?.[u.color] === sq) worth -= 0.19 * worth;
        if (u.transparent && p.stickyRules !== 1)
          worth -= worth * 0.1 * u.transparent.turns;
        const locks = (p || s).towerCaptures;
        if (locks && Object.values(locks).some(lock => lock.squares.includes(sq))) worth *= 0.85;
        if (trapped.length === 1 && trapped[0][0] === sq) worth -= 0.16 * worth;
        if (x === 8) worth += 0.25;
        if (sq.length > 2) worth += Math.min(0.75, worth * 0.16);
        if (sq.length === 2 && (!u.transparent || p?.stickyRules === 1)) {
          const attackers = units.filter(
            ([from, a]) =>
              a.color !== u.color &&
              s.locked?.[a.color] !== from &&
              hits(from, a, sq),
          );
          if (attackers.length) {
            const covered = units.some(
              ([from, a]) => a.color === u.color && hits(from, a, sq),
            );
            const cheapest = Math.min(
              ...attackers.map(([, a]) =>
                a.type === 'k' ? 100 : values[a.walk || a.type] || 2.7,
              ),
            );
            loose[u.color] = Math.max(
              loose[u.color],
              worth - (covered ? cheapest : 0),
            );
          }
        }
      } else if (advance === 0 && (x === 2 || x === 6)) worth += 0.28;
      score += sign(u.color) * worth;
    }
    for (const c of sides) {
      const id = s.stands[c];
      // Shared evaluation never reads the private charge or mana of Bites the Dust.
      const charge =
        id === 'dust' ? 0 : (s.mana[c] || 0) / (STANDS[id].cost || 100);
      const usableRevives = (s.fallen || []).filter(
        (f) => f.color === c && !game.chess.get(f.home),
      );
      const reserve =
        {
          world: 1.6,
          crimson: 1.25,
          diamond: Math.min(
            3,
            Math.max(0, ...usableRevives.map((f) => values[f.type] * 0.65)),
          ),
          gold: 1.35,
          heaven: 1.6,
          kiss: 1.15,
          enigma: 0.65,
          echoes: 0.85,
          sticky: 1.1,
          gojo: p?.gojo?.[c] === 2 ? 2.8 : 1.15,
        }[id] || 0;
      score +=
        sign(c) *
        (reserve * charge ** 2 +
          (p?.wonder?.[c] || 0) * 0.27 +
          (id === 'wonder' ? charge ** 2 * 0.9 : 0) -
          (p?.snared?.[c] ? 0.5 : 0));
      score -= sign(c) * loose[c] * (game.turn() === c ? 0.12 : 0.58);
      // Once enough public turns have passed, either player can anticipate a trap.
      if (id === 'dust' && Number(s.fen.split(' ')[5]) > 10)
        score += sign(c) * Math.min(0.8, loose[c] * 0.15);
    }
    if (s.freeze) score += sign(game.turn()) * (s.freeze === 2 ? 1.6 : 1.1);
    if (game.chess.in_check()) score -= 0.25 * sign(game.turn());
    return Math.max(-28, Math.min(28, score));
  }
  function label(score, verdict) {
    if (verdict) return verdict.startsWith('Мат') ? 'Мат' : '½–½';
    return Math.abs(score) < 0.05
      ? '0,0'
      : (score > 0 ? '+' : '−') + Math.abs(score).toFixed(1).replace('.', ',');
  }
  function share(score) {
    return 1 / (1 + Math.exp(-score / 3.6));
  }
  function apply(g, a) {
    if (a.kind === 'move') return g.move(a.from, a.to, promotion(a));
    if (a.kind === 'merge') return g.merge(a.color);
    if (a.kind === 'debug') return g.recharge();
    const archivedPurple =
      a.stand === 'gojo' &&
      a.choice?.startsWith('purple:') &&
      Array.isArray(a.victims);
    return g.activate(
      a.color,
      a.target,
      a.choice,
      archivedPurple ? a.width || 5 : 0,
    );
  }
  function actions(g) {
    const c = g.turn(),
      id = g.state.stands[c];
    const moves = g.moves().map((m) => ({ ...m, kind: 'move' }));
    if (g.canMerge?.(c)) moves.push({ kind: 'merge', color: c });
    if (id === 'dust' || g.abilityBlock(c)) return moves;
    const choices =
      g.choices?.(c) || g.targets(c).map((target) => ({ target }));
    for (const opt of choices.length ? choices : [{}])
      moves.push({ kind: 'ability', color: c, ...opt });
    return moves;
  }
  function publicSnapshot(state) {
    const s = JSON.parse(JSON.stringify(state));
    delete s.verdict;
    delete s.legalMoves;
    for (const c of sides) {
      if (s.stands[c] !== 'dust') continue;
      s.mana[c] = 0;
      if (s.lastMove?.color === c) s.lastMove.manaEarned = 0;
      s.positions = s.positions.slice(0, 1);
    }
    for (const p of [s.position, s.lastMove?.previous])
      if (p) for (const u of Object.values(p.units)) delete u.dust;
    // Counterfactuals need the previous action for Crimson, not a copy of the journal.
    s.events = s.lastMove ? [{}] : [];
    if (s.lastMove) s.lastMove.event = 0;
    return s;
  }
  function promotion(a) {
    return a.promotion || a.san?.match(/=([QRBN])/i)?.[1].toLowerCase();
  }
  function id(a) {
    if (a.kind === 'merge') return 'merge|' + a.color;
    return [
      a.kind,
      a.color,
      a.from,
      a.to,
      promotion(a),
      a.target,
      a.choice,
    ].join('|');
  }
  function name(a, stands) {
    if (a.kind === 'move')
      return (
        a.from.slice(0, 2) +
        '–' +
        a.to +
        (promotion(a) ? '=' + promotion(a).toUpperCase() : '')
      );
    if (a.kind === 'merge') return 'Снять наклейку';
    if (stands[a.color] === 'gojo') {
      const [mode, dest] = a.choice.split(':');
      return (
        {
          infinity: 'Бесконечность',
          blue: 'Синий',
          red: 'Красный',
          purple: 'Фиолетовый',
        }[mode] +
        ' ' +
        a.target.slice(0, 2) +
        (dest ? ' → ' + dest : '')
      );
    }
    return (
      STANDS[stands[a.color]].name +
      (a.target ? ' ' + a.target : '') +
      (a.choice ? ' → ' + (pieceNames[a.choice] || a.choice) : '')
    );
  }
  function successors(g) {
    const seed = publicSnapshot(g.state);
    return actions(g)
      .map((a) => {
        const next = restoreForAnalysis(seed);
        if (!apply(next, a)) return null;
        return { a, next, score: balance(next) };
      })
      .filter(Boolean);
  }
  function restoreForAnalysis(snapshot) {
    const g = StandGame.restore(snapshot);
    if (snapshot.position?.stickyRules === 1) {
      g.p.stickyRules = 1;
      if (g.state.lastMove?.previous) g.state.lastMove.previous.stickyRules = 1;
    }
    return g;
  }
  const openingLines = [
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4',
    'e2e4 e7e6 d2d4 d7d5',
    'e2e4 c7c6 d2d4 d7d5',
    'd2d4 d7d5 c2c4 e7e6',
    'd2d4 d7d5 c2c4 d5c4',
    'd2d4 g8f6 c2c4 g7g6',
  ];
  function bookMove(state, event) {
    if (
      event.kind !== 'move' ||
      state.events.length >= 6 ||
      state.tower ||
      state.startFen !==
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' ||
      state.events.some((a) => a.kind !== 'move')
    )
      return false;
    const line = [...state.events, event].map((m) => m.from + m.to).join(' ');
    return openingLines.some(
      (book) => book === line || book.startsWith(line + ' '),
    );
  }
  // An offered piece qualifies only if accepting the sacrifice allows a verified mate.
  function matingReply(g, actor) {
    if (g.turn() !== actor || g.result()) return false;
    const seed = publicSnapshot(g.state);
    return actions(g).some((a) => {
      if (a.kind === 'move' && a.san && !/[+#]/.test(a.san)) return false;
      const next = restoreForAnalysis(seed);
      return (
        apply(next, a) &&
        next.turn() !== actor &&
        next.result().startsWith('Мат')
      );
    });
  }
  function grade(before, after, event) {
    const actor = event.color,
      direction = sign(actor);
    const played = name(event, before.stands);
    if (event.detonation) return { played, tag: 'Ловушка', accuracy: null };
    const g = restoreForAnalysis(publicSnapshot(before));
    if (event.kind === 'merge' && actor !== g.turn()) {
      const loss = Math.max(
        0,
        direction *
          (share(balance(g)) -
            share(balance(restoreForAnalysis(publicSnapshot(after))))),
      );
      return classify(played, loss, 'Сохранить копию');
    }
    const ranked = successors(g).sort(
      (a, b) => direction * (b.score - a.score),
    );
    const actual = ranked.find((r) => id(r.a) === id(event));
    if (!actual) return { played, tag: 'По правилам стенда', accuracy: null };
    const finalists = ranked.slice(0, 3);
    const power = ranked.find((r) => r.a.kind !== 'move');
    if (power && !finalists.includes(power)) finalists.push(power);
    if (!finalists.includes(actual)) finalists.push(actual);
    for (const line of finalists) {
      if (line.next.result()) continue;
      const replies = successors(line.next);
      if (replies.length) {
        const offered =
          line.a.kind === 'move' && line.next.chess.get(line.a.to);
        const captured =
          line.a.kind === 'move' &&
          line.a.captured &&
          g.chess.get(line.a.death || line.a.to);
        if (
          offered?.color === actor &&
          offered.type !== 'k' &&
          !promotion(line.a) &&
          line.next.turn() !== actor &&
          !line.next.state.position?.links?.some(
            (link) => link.clone === line.a.to,
          ) &&
          values[offered.walk || offered.type] -
            (values[captured?.walk || captured?.type] || 0) >=
            1.7
        ) {
          const takes = replies.filter(
            (r) =>
              r.a.kind === 'move' &&
              r.a.captured &&
              (r.a.death || r.a.to) === line.a.to,
          );
          if (takes.length && takes.every((r) => matingReply(r.next, actor))) {
            for (const r of takes) r.score = 32 * direction;
            line.soundSacrifice = true;
          }
        }
        const mover = sign(line.next.turn());
        line.score = mover * Math.max(...replies.map((r) => mover * r.score));
      }
    }
    finalists.sort((a, b) => direction * (b.score - a.score));
    const best = finalists[0];
    const loss = Math.max(
      0,
      direction * (share(best.score) - share(actual.score)),
    );
    const row = classify(played, loss, name(best.a, before.stands));
    if (actual.soundSacrifice && loss < 0.01 && direction * actual.score >= 0) {
      row.tag = 'Бриллиантовый';
      row.note = 'Принятие жертвы позволяет поставить мат следующим действием.';
    } else if (
      loss > 0.15 &&
      best.score * direction >= 32 &&
      actual.score * direction < 12
    ) {
      row.tag = 'Упущенный шанс';
      row.note = 'Была возможность поставить мат.';
    } else if (loss < 0.07 && bookMove(before, event)) {
      row.tag = 'Книжный';
    } else if (
      actual === best &&
      finalists.length > 1 &&
      !actual.next.result() &&
      direction * (share(best.score) - share(finalists[1].score)) >= 0.15
    ) {
      row.tag = 'Сильный';
      row.note = 'Этот ход заметно сильнее других проверенных продолжений.';
    }
    return row;
  }
  function classify(played, loss, best) {
    return {
      played,
      best,
      accuracy: Math.round(100 * Math.exp(-4.1 * loss)),
      tag:
        loss < 0.0001
          ? 'Лучший'
          : loss < 0.025
            ? 'Отличный'
            : loss < 0.07
              ? 'Хороший'
              : loss < 0.15
                ? 'Неточность'
                : loss < 0.27
                  ? 'Ошибка'
                  : 'Зевок',
    };
  }
  const api = { balance, label, share, grade, apply };
  if (typeof module !== 'undefined') module.exports = api;
  root.StandAnalysis = api;
})(globalThis);
