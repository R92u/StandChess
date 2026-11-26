(() => {
  'use strict';
  const {
    StandGame,
    scenarios,
    scenario,
    MAX_MANA,
    STANDS,
    DEFAULT_STANDS,
    inTower,
  } = window.StandChess;
  const $ = (id) => document.getElementById(id);
  const icons = {
    zip: '<path d="M9 2v7m6-7v7M9 3h3m0 2h3M9 7h3m-2 7L5 21m9-7 5 7"/><path d="m9 9 3-2 3 2v3l-3 3-3-3z"/><path d="M12 10v2"/>',
    tower:
      '<path d="m12 2-2 4h4zM10.5 6 6 22m7.5-16L18 22M4 22h5m6 0h5M6 7h12l2 2h-4M6 7 4 9h4m-3 2h14l2 2h-5m-11-2-2 2h5m1.4-.8 5.9 4.8m-1.9-4.8L8.2 17m-.5 2.4 8.8-2.1M9 17l8 4"/>',
    gravity:
      '<path d="M6 3v10l-3-3m3 3 3-3m8-7v10l-3-3m3 3 3-3M3 17h18M5 21h14"/>',
    gem: '<path d="m2 9 5-6h10l5 6-10 12zM2 9h20M7 3l5 18 5-18"/>',
    swords:
      '<path d="m4 3 4 1 8 9-3 3-9-9zM14 16l5 5m-5-3 4-4M20 3l-4 1-3 4m-5 5-3 3m-2 4 5-5m-3-1 5 5"/>',
    plus: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 7v10M7 12h10"/>',
    board:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/><path fill="currentColor" stroke="none" d="M4 4h5v5H4zm5 5h6v6H9zm6 6h5v5h-5zm0-11h5v5h-5zM4 15h5v5H4z"/>',
    sound:
      '<path d="m4 9 4 0 5-4v14l-5-4H4zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="m3 9 4 0 5-4v14l-5-4H3zm13 0 5 6m0-6-5 6"/>',
    bug: '<rect x="7" y="7" width="10" height="14" rx="5"/><path d="m9 6-2-3m8 3 2-3M7 10 4 8m3 6H3m4 3-3 3m13-10 3-2m-3 6h4m-4 3 3 3M8 12h8"/>',
    players:
      '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3.1 3.1 0 0 1 0 6m2 3a5.5 5.5 0 0 1 3 5"/>',
    restart: '<path d="M4 4v6h6M4 10a8 8 0 1 1 .8 7"/>',
    flip: '<path d="m4 7 3-3m-3 3 3 3M4 7h12a3 3 0 0 1 3 3m1 7-3 3m3-3-3-3m3 3H8a3 3 0 0 1-3-3"/>',
    spark:
      '<path d="m12 2 2.4 6.7L21 11l-6.6 2.4L12 20l-2.3-6.6L3 11l6.7-2.3zM20 2v4m-2-2h4"/>',
    rewind: '<path d="m12 6-8 6 8 6zm8 0-8 6 8 6z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    zap: '<path d="M14 2 5 14h6l-1 8 9-12h-6z"/>',
    history: '<path d="M3 4v6h6M3.5 10a8.5 8.5 0 1 1 .7 7M12 7v5l3 2"/>',
    undo: '<path d="m3 9 5-5M3 9l5 5m-5-5h11a6 6 0 0 1 0 12"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    play: '<path d="m7 4 13 8-13 8z"/>',
    flag: '<path d="M5 21V4c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
  };
  const icon = (name) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    icons[name] +
    '</svg>';
  document
    .querySelectorAll('[data-icon]')
    .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  const pieces = {
    p: 'пешка',
    n: 'конь',
    b: 'слон',
    r: 'ладья',
    q: 'ферзь',
    k: 'король',
  };
  const sides = { w: 'Белые', b: 'Чёрные' };
  const clip = {
    w: new Audio('assets/audio/king-crimson.mp3'),
    b: new Audio('assets/audio/the-world.mp3'),
    echoes: new Audio('assets/audio/echoes.mp3'),
    diamond: new Audio('assets/audio/diamond.mp3'),
  };
  const extraStands = [
    'enigma',
    'gold',
    'kiss',
    'heaven',
    'house',
    'superfly',
    'wonder',
    'sticky',
  ];
  for (const id of extraStands)
    clip[id] = new Audio('assets/audio/' + id + '.mp3');
  for (const id of ['enigma-shot', 'diavolo', 'world-call', 'calamity'])
    clip[id] = new Audio('assets/audio/' + id + '.mp3');
  for (const audio of Object.values(clip)) {
    audio.preload = 'auto';
    audio.volume = 0.62;
  }
  const storage = {
    read(key) {
      try {
        return localStorage.getItem('stand-chess.v1.' + key);
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem('stand-chess.v1.' + key, value);
      } catch {}
    },
  };
  let mainGame;
  try {
    const saved = JSON.parse(storage.read('match'));
    mainGame = StandGame.restore(saved);
    if (!saved.mana)
      storage.write('match', JSON.stringify(mainGame.snapshot()));
  } catch {
    mainGame = new StandGame();
  }
  let game = mainGame,
    debug = false,
    selected = null,
    candidates = [],
    flipped = storage.read('flipped') === 'yes';
  let sound = storage.read('sound') !== 'off',
    debugUndo = [],
    promote = null,
    toastTimer,
    synth;
  let focusSquare = 'e2',
    targeting = null;
  let targetOrigin = null;
  let gesture = null,
    suppressDragClick = false;
  let showTowerZone = true;
  const boardElement = $('board');
  const online = new window.StandRoom(applyRoomState, roomConnectionChanged);
  const roomParam = () => new URL(location.href).searchParams.get('room');
  const invitedRoom = () =>
    /^[0-9a-f]{24}$/.test(roomParam() || '') ? roomParam() : null;
  let enteringRoom = false;
  let review = null;
  const displayed = () => review || game;
  function replayStart() {
    const s = game.state,
      key = s.positions[0];
    let fen = s.startFen,
      mana;
    if (s.position) {
      const [[units, side, rights, ep], banks] = JSON.parse(key);
      if (!fen) {
        const pieces = new Map(
          units.map(([sq, c, t]) => [sq, c === 'w' ? t.toUpperCase() : t]),
        );
        const rows = [...'87654321'].map((r) =>
          [...'abcdefgh']
            .map((f) => pieces.get(f + r) || '1')
            .join('')
            .replace(/1+/g, (m) => m.length),
        );
        fen = [rows.join('/'), side, rights || '-', ep || '-', 0, 1].join(' ');
      }
      mana = Math.max(banks.w, banks.b);
    } else {
      const [position, w] = key.split('|');
      fen ||= position + ' 0 1';
      mana = Number(w);
    }
    return new StandGame(fen, mana, s.stands, s.tower, s.towerRadius);
  }
  function seek(index) {
    const events = game.state.events;
    resetSelection();
    stopAudio();
    window.StandEffects.stop();
    if (index >= events.length) review = null;
    else {
      const replay =
        review && review.state.events.length <= index ? review : replayStart();
      for (const e of events.slice(replay.state.events.length, index)) {
        let ok;
        if (e.kind === 'move')
          ok = replay.move(
            e.from,
            e.to,
            e.promotion || e.san?.match(/=([QRBN])/i)?.[1].toLowerCase(),
          );
        else if (e.kind === 'ability')
          ok = replay.activate(e.color, e.target, e.choice);
        else if (e.kind === 'merge') ok = replay.merge(e.color);
        else if (e.kind === 'debug') ok = replay.recharge();
        if (!ok) {
          review = null;
          render();
          toast('Не удалось восстановить этот ход');
          return;
        }
        if (e.calamity)
          replay.state.events.at(-1).calamity = e.calamity.map((hit) => ({
            ...hit,
          }));
      }
      review = replay;
    }
    render();
  }
  $('replay-first').onclick = () => seek(0);
  $('replay-prev').onclick = () =>
    seek(Math.max(0, displayed().state.events.length - 1));
  $('replay-next').onclick = () => seek(displayed().state.events.length + 1);
  $('replay-last').onclick = () => seek(game.state.events.length);
  function renderReplay() {
    const end = game.state.events.length,
      index = displayed().state.events.length;
    $('replay-first').disabled = $('replay-prev').disabled = index === 0;
    $('replay-last').disabled = $('replay-next').disabled = !review;
    $('replay-status').textContent = review
      ? 'Просмотр · ' + index + ' / ' + end
      : 'Текущая позиция';
  }
  const mayPlay = () =>
    !review &&
    (!online.id ||
      (online.ready &&
        online.connected &&
        !online.busy &&
        online.side === game.turn()));
  const stone = (color) =>
    '<span class="side-stone ' +
    (color === 'w' ? 'white' : 'black') +
    '"></span>';
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
  }
  function stopAudio() {
    Object.values(clip).forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }
  function playClip(color, preview = false) {
    if (!sound) {
      if (preview)
        $('debug-feedback').textContent =
          'Звук выключен. Включите его в меню игры.';
      return;
    }
    stopAudio();
    if (preview)
      $('debug-feedback').textContent =
        'Звучит ' + STANDS[DEFAULT_STANDS[color] || color].name;
    clip[color].play().catch((err) => {
      if (err.name === 'AbortError') return;
      const msg = 'Не удалось воспроизвести запись.';
      if (preview) $('debug-feedback').textContent = msg;
      else toast(msg);
    });
  }
  function moveSound(capture) {
    if (!sound || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      synth ||= new (window.AudioContext || window.webkitAudioContext)();
      if (synth.state === 'suspended') synth.resume().catch(() => {});
      const tone = synth.createOscillator(),
        gain = synth.createGain(),
        now = synth.currentTime;
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(capture ? 290 : 410, now);
      tone.frequency.exponentialRampToValueAtTime(90, now + 0.065);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      tone.connect(gain).connect(synth.destination);
      tone.start(now);
      tone.stop(now + 0.08);
    } catch {}
  }
  function resetSelection() {
    targeting = null;
    targetOrigin = null;
    releaseGesture();
    selected = null;
    candidates = [];
    promote = null;
  }
  function track() {
    if (debug) {
      debugUndo.push(game.snapshot());
      if (debugUndo.length > 48) debugUndo.shift();
    }
  }
  function changed() {
    review = null;
    resetSelection();
    if (!debug && !online.id)
      storage.write('match', JSON.stringify(game.snapshot()));
    render();
  }
  function renderBoard(game = displayed()) {
    const hasRoom = Object.values(game.state.stands).includes('house');
    const files = [...(hasRoom ? 'abcdefghi' : 'abcdefgh')];
    if (flipped) files.reverse();
    const ranks = Array.from(flipped ? '12345678' : '87654321');
    const board = $('board'),
      fragment = document.createDocumentFragment(),
      inCheck = game.chess.in_check(),
      playing = !game.result() && mayPlay();
    board.classList.toggle('house-board', hasRoom);
    const abilityTargets = targeting
      ? targetOrigin
        ? game
            .choices(targeting)
            .filter((o) => o.target === targetOrigin)
            .map((o) => o.choice)
        : game.targets(targeting)
      : [];
    const tower = game.state.tower;
    const occupants = game.towerOccupants();
    const lastInZone = occupants.length === 1 ? occupants[0] : null;
    $('tower-info').hidden = !tower;
    if (tower) {
      const count = occupants.length;
      $('tower-info').lastElementChild.textContent =
        'Башня ' +
        tower +
        (game.state.towerRadius === 3
          ? ' · радиус 3 клетки · '
          : ' · радиус 1 клетка · ') +
        (lastInZone
          ? 'Последняя фигура на ' + lastInZone
          : 'В зоне ' +
            count +
            ' ' +
            plural(count, 'фигура', 'фигуры', 'фигур'));
    }
    for (const rank of ranks)
      for (const file of files) {
        const square = file + rank,
          piece = game.chess.get(square),
          cell = document.createElement('button');
        if (file === 'i' && !'345'.includes(rank)) {
          fragment.append(node('span', 'room-void', ''));
          continue;
        }
        const target = candidates.some((m) => m.to === square);
        cell.type = 'button';
        cell.dataset.square = square;
        cell.className = 'sq';
        if (file === 'i') cell.classList.add('room-square');
        if (square === targetOrigin) cell.classList.add('selected');
        if (candidates.some((m) => m.to === square && m.shot))
          cell.classList.add('enigma-risk');
        if (tower && inTower(tower, square, game.state.towerRadius)) {
          if (showTowerZone) {
            const field = node('span', 'tower-field', '');
            const col = files.indexOf(file),
              row = ranks.indexOf(rank);
            for (const [edge, f, r] of [
              ['left', col - 1, row],
              ['right', col + 1, row],
              ['top', col, row - 1],
              ['bottom', col, row + 1],
            ]) {
              if (
                !files[f] ||
                !ranks[r] ||
                !inTower(tower, files[f] + ranks[r], game.state.towerRadius)
              )
                field.classList.add('edge-' + edge);
            }
            cell.append(field);
          }
          if (square === tower) {
            const marker = node(
              'span',
              'tower-marker' + (piece ? ' shared' : ''),
              '',
            );
            marker.innerHTML = icon('tower');
            cell.append(marker);
          }
          if (square === lastInZone && showTowerZone)
            cell.classList.add('tower-last');
        }
        const locked = piece && game.state.locked[piece.color] === square;
        if (locked) cell.classList.add('gravity-lock');
        const abilityTarget = abilityTargets.includes(square);
        if (abilityTarget)
          cell.classList.add('stand-target', game.state.stands[targeting]);
        cell.tabIndex = square === focusSquare ? 0 : -1;
        if ((file.charCodeAt(0) - 97 + Number(rank)) % 2 === 1)
          cell.classList.add('dark');
        if (
          [game.state.lastMove?.from, game.state.lastMove?.to].includes(square)
        )
          cell.classList.add('last');
        if (square === selected) cell.classList.add('selected');
        if (target) cell.classList.add(piece ? 'capture' : 'legal');
        if (inCheck && piece?.type === 'k' && piece.color === game.turn())
          cell.classList.add('check');
        const transparency = piece?.transparent;
        const transparencyLabel = transparency
          ? 'Sticky Fingers · ' +
            sides[transparency.caster] +
            ': ещё ' +
            transparency.turns +
            ' ' +
            plural(transparency.turns, 'ход', 'хода', 'ходов')
          : '';
        const label =
          square +
          (piece
            ? ', ' + sides[piece.color] + ', ' + pieces[piece.type]
            : ', пусто') +
          (target ? ', доступный ход' : '') +
          (locked ? ', под действием Three Freeze' : '') +
          (transparency ? ', прозрачная фигура, ' + transparencyLabel : '') +
          (square === tower ? ', башня Super Fly' : '') +
          (square === lastInZone ? ', последняя фигура в зоне башни' : '') +
          (abilityTarget ? ', цель стенда' : '');
        cell.setAttribute('aria-label', label);
        cell.setAttribute('aria-pressed', String(square === selected));
        if (file === (flipped ? 'h' : 'a'))
          cell.append(node('span', 'coord rank', rank));
        if (file === 'i') cell.append(node('span', 'coord rank', square));
        if (rank === ranks[7]) cell.append(node('span', 'coord file', file));
        if (piece) {
          if (playing && !targeting && !locked && piece.color === game.turn())
            cell.classList.add('movable');
          const img = document.createElement('img');
          if (transparency) {
            img.classList.add('piece', 'sticky-transparent');
            cell.title = transparencyLabel;
          }
          img.src =
            'assets/pieces/' +
            piece.color +
            (piece.walk || piece.type).toUpperCase() +
            '.svg';
          img.alt = '';
          img.draggable = false;
          cell.append(img);
          const link = game.state.position?.links.find(
            (l) => l.clone === square || l.original === square,
          );
          if (link) {
            const badge = node(
              'span',
              'unit-badge kiss',
              link.clone === square ? 'Ⅱ' : 'Ⅰ',
            );
            badge.title =
              (link.clone === square ? 'Копия' : 'Оригинал') +
              ' · осталось ходов: ' +
              link.left;
            cell.append(badge);
            cell.setAttribute('aria-label', label + ', ' + badge.title);
          }
          if (piece.walk) {
            const badge = node(
              'span',
              'walk-badge',
              { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }[piece.type],
            );
            badge.title =
              'Исходная фигура — ' +
              pieces[piece.type] +
              '. Ходит как ' +
              pieces[piece.walk];
            cell.title = [cell.title, badge.title].filter(Boolean).join(' · ');
            cell.append(badge);
            cell.setAttribute(
              'aria-label',
              cell.getAttribute('aria-label') + ', ' + badge.title,
            );
          }
        } else if (
          abilityTarget &&
          game.state.stands[targeting] === 'diamond'
        ) {
          const f = game.state.fallen.find(
            (f) => f.home === square && f.color === targeting,
          );
          const ghost = document.createElement('img');
          ghost.src =
            'assets/pieces/' + targeting + f.type.toUpperCase() + '.svg';
          ghost.alt = '';
          ghost.className = 'revive-ghost';
          ghost.draggable = false;
          cell.append(ghost);
          cell.setAttribute(
            'aria-label',
            square + ', восстановить: ' + pieces[f.type],
          );
        }
        fragment.append(cell);
      }
    const hadFocus = board.contains(document.activeElement);
    board.replaceChildren(fragment);
    window.PieceEffects.sync();
    window.BoardStandFX.sync();
    if (hadFocus)
      board.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
  }
  function node(tag, cls, value) {
    const el = document.createElement(tag);
    el.className = cls;
    el.textContent = value;
    return el;
  }
  function renderLog() {
    const log = $('journal-list'),
      events = game.state.events;
    const count = events.filter(
      (e) =>
        (e.kind === 'move' ||
          (e.kind === 'ability' &&
            ['diamond', 'gold', 'heaven', 'kiss', 'sticky'].includes(
              e.stand,
            ))) &&
        !e.erased,
    ).length;
    $('event-count').textContent =
      count + ' ' + plural(count, 'ход', 'хода', 'ходов');
    const fragment = document.createDocumentFragment();
    const first = node('div', 'entry empty', '');
    const flag = node('i', '', '');
    flag.innerHTML = icon('flag');
    first.append(flag, node('span', '', 'Партия началась'));
    fragment.append(first);
    for (const [i, e] of events.entries()) {
      const row = node('div', 'entry' + (e.erased ? ' erased' : ''), '');
      row.append(node('small', '', String(i + 1).padStart(2, '0')));
      if (e.kind === 'move') {
        const side = node(
          'span',
          'side-stone ' + (e.color === 'w' ? 'white' : 'black'),
          '',
        );
        side.title = sides[e.color];
        row.append(
          side,
          node('span', 'move-san', e.san),
          node(
            'span',
            'detail',
            e.from +
              ' → ' +
              e.to +
              (e.shot ? ' · Enigma уничтожила фигуру' : '') +
              (e.erased ? ' · стёрт' : ''),
          ),
        );
      } else {
        row.append(
          node(
            'span',
            'ability-event ' + (game.state.stands[e.color] || ''),
            e.text,
          ),
        );
        if (e.detail) row.append(node('span', 'detail', e.detail));
      }
      for (const hit of e.calamity || []) {
        const accident = [
          'Упала вывеска',
          'Налетела тележка',
          'Прорвало трубу',
        ][hit.variant];
        row.append(
          node(
            'span',
            'detail',
            accident + ' · ' + pieces[hit.type] + ' ' + hit.square,
          ),
        );
      }
      fragment.append(row);
    }
    log.replaceChildren(fragment);
    log.scrollTop = log.scrollHeight;
  }
  function plural(n, one, few, many) {
    return n % 10 === 1 && n % 100 !== 11
      ? one
      : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
        ? few
        : many;
  }
  function renderSound() {
    const btn = $('sound-toggle');
    btn.querySelector('span').textContent = sound ? 'Звук вкл.' : 'Звук выкл.';
    btn.querySelector('i').innerHTML = icon(sound ? 'sound' : 'mute');
    btn.setAttribute('aria-pressed', String(sound));
    btn.setAttribute('aria-label', sound ? 'Выключить звук' : 'Включить звук');
    btn.title = btn.getAttribute('aria-label');
  }
  function renderPlayers(game = displayed()) {
    const ended = Boolean(game.result());
    const colors = flipped ? ['w', 'b'] : ['b', 'w'];
    for (const [index, side] of colors.entries()) {
      const row = $(index === 0 ? 'player-top' : 'player-bottom');
      const id = game.state.stands[side],
        stand = STANDS[id];
      const active = !ended && side === game.turn();
      row.classList.toggle('active', active);
      row.dataset.color = side;
      const avatar = node('div', 'avatar ' + id, '');
      const image = document.createElement('img');
      image.src = 'assets/art/' + stand.art + '-avatar.webp';
      image.alt = '';
      avatar.append(image);
      const info = node('div', 'player-text', ''),
        label = node('span', 'player-side', '');
      label.innerHTML = stone(side);
      label.append(document.createTextNode(sides[side] + ' · ' + stand.name));
      info.append(node('span', 'player-name', stand.user), label);
      row.replaceChildren(avatar, info);
      if (active) {
        const led = node('span', 'player-led', '');
        led.setAttribute('aria-label', 'Сейчас ходит');
        led.title = 'Сейчас ходит';
        row.append(led);
      }
    }
  }
  function render(game = displayed()) {
    renderReplay();
    renderBoard();
    renderPlayers();
    renderLog();
    renderSound();
    const s = game.state,
      result = game.result(),
      color = game.turn(),
      check = game.chess.in_check();
    let turnLabel =
      result ||
      (s.freeze
        ? s.freeze === 2
          ? (color === 'w' ? 'Ход белых' : 'Ход чёрных') + ' · первый ход'
          : (color === 'w' ? 'Ход белых' : 'Ход чёрных') + ' · второй ход'
        : (check ? 'Шах · ' : '') +
          (color === 'w' ? 'Ход белых' : 'Ход чёрных'));
    if (review) turnLabel = 'Просмотр · ' + turnLabel;
    else if (online.id && !result) {
      if (!online.connected) turnLabel = 'Восстанавливаем связь…';
      else if (!online.ready) turnLabel = 'Ожидаем друга';
      else turnLabel += online.side === color ? ' · ваш ход' : ' · ход друга';
    }
    $('turn').innerHTML =
      (result ? '<i>' + icon('flag') + '</i>' : stone(color)) + '<span></span>';
    $('turn').lastElementChild.textContent = turnLabel;
    $('turn').classList.toggle('in-check', check);
    $('turn').classList.toggle('frozen', Boolean(s.freeze) && !result);
    $('turn').classList.toggle('finished', Boolean(result));
    document.body.dataset.timeStopped = String(Boolean(s.freeze) && !result);
    $('move-number').textContent = 'Ход ' + s.fen.split(' ')[5];
    $('stand-cost').textContent = ['w', 'b'].every((c) =>
      ['house', 'superfly'].includes(s.stands[c]),
    )
      ? 'Пассивные стенды действуют с начала партии'
      : '+10 маны за свой ход';
    for (const side of ['w', 'b']) {
      const id = s.stands[side],
        stand = STANDS[id],
        card = $('card-' + side);
      if (card.dataset.stand !== id) {
        card.dataset.stand = id;
        card.className = 'stand-card ' + id;
        card.querySelector('.art-scene img').src =
          'assets/art/' + stand.art + '.webp';
        card.querySelector('h3').textContent = stand.name;
        card.querySelector('.power-name').innerHTML =
          '<i>' + icon(stand.icon) + '</i>' + stand.power;
        card.querySelector('.stand-body p').textContent = stand.description;
      }
      if (id === 'wonder') {
        const counter = s.position?.wonder?.[side] || 0;
        card.querySelector('.power-name').innerHTML =
          '<i>' +
          icon(stand.icon) +
          '</i>' +
          stand.power +
          (counter
            ? ' · ещё ' +
              counter +
              ' ' +
              plural(counter, 'ход', 'хода', 'ходов') +
              ' соперника'
            : '');
      }
      const meter = $('mana-' + side);
      const passive = id === 'superfly' || id === 'house';
      const max = stand.cost || MAX_MANA;
      const mergeButton = $('merge-' + side);
      mergeButton.hidden = !s.position?.links.some((l) => l.owner === side);
      mergeButton.disabled =
        !!review ||
        !!result ||
        (online.id &&
          (online.side !== side || online.busy || !online.connected)) ||
        !game.canMerge?.(side);
      meter.hidden = passive;
      const blocked = game.abilityBlock(side),
        btn = $('power-' + side);
      if (passive) {
        if (id === 'house') {
          btn.innerHTML = '<i>' + icon('board') + '</i>Показать комнату';
          btn.disabled = false;
          btn.title = 'Призрачные клетки i3–i5';
          btn.removeAttribute('aria-pressed');
          btn.setAttribute('aria-label', 'Показать призрачную комнату');
          continue;
        }
        const action = showTowerZone ? 'Скрыть зону' : 'Показать зону';
        btn.innerHTML = '<i>' + icon('tower') + '</i>' + action;
        btn.disabled = false;
        btn.title = 'Башня ' + s.tower + ' · действует с начала партии';
        btn.setAttribute('aria-label', 'Super Fly · ' + action);
        btn.setAttribute('aria-pressed', String(showTowerZone));
        continue;
      }
      btn.removeAttribute('aria-pressed');
      btn.disabled =
        Boolean(blocked) || !mayPlay() || (online.id && online.side !== side);
      btn.title = blocked || 'Потратить ' + max + ' маны';
      let action = targeting === side ? 'Отмена выбора' : stand.action;
      if (blocked) {
        if (result) action = 'Партия завершена';
        else if (s.freeze) action = 'Время остановлено';
        else if (s.mana[side] < max) action = 'Нужно ' + max + ' маны';
        else if (color !== side)
          action = side === 'w' ? 'В ход белых' : 'В ход чёрных';
        else action = blocked;
      }
      btn.replaceChildren(node('i', '', ''), document.createTextNode(action));
      btn.firstChild.innerHTML = icon(blocked ? 'clock' : 'zap');
      btn.setAttribute('aria-label', stand.name + ' · ' + (blocked || action));
      const value = s.mana[side];
      meter.setAttribute('aria-valuenow', String(value));
      meter.setAttribute('aria-valuemax', String(max));
      meter.style.setProperty('--mana-fill', value / max);
      meter.querySelector('b').textContent = value + ' / ' + max;
    }
    $('leave-match').hidden = !online.id;
    $('match-type').textContent = online.id
      ? 'Онлайн · вы играете за ' + (online.side === 'w' ? 'белых' : 'чёрных')
      : debug
        ? 'Тестовая партия'
        : 'Локальная партия';
    $('debug-open').classList.toggle('active', debug);
    $('debug-open').setAttribute('aria-pressed', String(debug));
    $('debug-banner').hidden = !debug;
    $('debug-undo').disabled = !debugUndo.length;
    $('recharge').disabled = !game.canRecharge();
    $('new-game').disabled = Boolean(online.id);
    $('choose-stands').hidden = Boolean(online.id || game.state.events.length);
    $('debug-open').disabled = Boolean(online.id);
    $('online-open').disabled = debug;
    $('online-open').classList.toggle('active', Boolean(online.id));
    $('online-open').setAttribute('aria-pressed', String(Boolean(online.id)));
    if ($('online').open) renderRoomDialog();
    const trapped = s.position?.snared[color];
    $('target-hint').hidden = !targeting && !trapped;
    if (trapped)
      $('target-hint').textContent =
        'Enigma · отступление уничтожит фигуру. Опасные ходы отмечены красным.';
    if (targeting)
      $('target-hint').textContent = {
        echoes: 'Выберите фигуру соперника, которую прижмёт Echoes.',
        diamond: 'Выберите стартовую клетку для восстановления.',
        gold: 'Выберите свою пешку.',
        kiss: targetOrigin
          ? 'Выберите соседнюю клетку для копии.'
          : 'Выберите свою фигуру для копирования.',
        heaven: 'Выберите фигуру в радиусе трёх клеток от своего короля.',
        sticky:
          'Выберите свою или чужую фигуру, кроме короля. Активация завершит ход.',
      }[s.stands[targeting]];
  }
  function makeMove(from, to, promotion) {
    if (!mayPlay()) return;
    if (online.id) {
      online.act({ type: 'move', from, to, promotion }).catch(roomActionError);
      return;
    }
    track();
    const wasFrozen = game.state.freeze > 0;
    const move = game.move(from, to, promotion);
    if (!move) {
      if (debug) debugUndo.pop();
      return;
    }
    moveSound(move.captured);
    changed();
    if (playCalamity(game.state.events.at(-1)?.calamity)) return;
    if (move.shot)
      playStand('shot', to, {
        type: move.walk || move.piece,
        color: move.color,
      });
    else if (to[0] === 'i') playStand('house', to);
    if (wasFrozen && (!game.state.freeze || game.result()))
      window.StandEffects.play('resume', sound);
  }
  function chooseSquare(square) {
    focusSquare = square;
    if (game.result() || !mayPlay()) return;
    if (targeting) {
      const id = game.state.stands[targeting];
      if (targetOrigin) {
        if (
          game
            .choices(targeting)
            .some((o) => o.target === targetOrigin && o.choice === square)
        )
          useStand(targeting, targetOrigin, square);
        return;
      }
      if (!game.targets(targeting).includes(square)) return;
      if (id === 'kiss') {
        targetOrigin = square;
        render();
        return;
      }
      if (id === 'heaven' || id === 'gold') {
        const dialog = $('stand-choice'),
          opts = $('stand-options');
        opts.replaceChildren();
        $('stand-choice-title').textContent =
          id === 'gold'
            ? 'В кого превратить пешку?'
            : 'Как будет ходить фигура?';
        for (const o of game
          .choices(targeting)
          .filter((o) => o.target === square)) {
          const btn = node('button', 'tool-button', pieces[o.choice]);
          btn.dataset.choice = o.choice;
          btn.onclick = () => {
            dialog.close();
            useStand(targeting, square, o.choice);
          };
          opts.append(btn);
        }
        dialog.showModal();
        return;
      }
      useStand(targeting, square);
      return;
    }
    const legal = candidates.filter((m) => m.to === square);
    if (selected && legal.length) {
      if (legal.some((m) => m.promotion)) {
        promote = { from: selected, to: square };
        const opts = $('promotion-options');
        opts.replaceChildren();
        for (const m of legal) {
          const btn = node('button', '', pieces[m.promotion]);
          btn.dataset.piece = m.promotion;
          const img = document.createElement('img');
          img.src =
            'assets/pieces/' + game.turn() + m.promotion.toUpperCase() + '.svg';
          img.alt = '';
          btn.prepend(img);
          opts.append(btn);
        }
        $('promotion').showModal();
      } else makeMove(selected, square);
      return;
    }
    if (
      selected !== square &&
      game.chess.get(square)?.color === game.turn() &&
      game.state.locked[game.turn()] !== square
    ) {
      selected = square;
      candidates = game.moves(square);
    } else resetSelection();
    renderBoard();
  }
  function releaseGesture() {
    const g = gesture;
    if (!g) return;
    gesture = null;
    if (g.ghost) {
      suppressDragClick = true;
      g.ghost.remove();
      g.origin.classList.remove('lifted');
      g.target?.classList.remove('drop-target');
      boardElement.classList.remove('dragging');
    }
    if (boardElement.hasPointerCapture(g.id))
      boardElement.releasePointerCapture(g.id);
  }
  function cancelGesture() {
    const dragging = Boolean(gesture?.ghost);
    releaseGesture();
    if (dragging) {
      resetSelection();
      renderBoard();
    }
  }
  function dropSquare(x, y) {
    const cell = document.elementFromPoint(x, y)?.closest('.sq');
    return cell?.parentElement === boardElement ? cell : null;
  }
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.isPrimary) suppressDragClick = false;
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      // A completed drag produces a compatibility click. Keyboard clicks have detail 0.
      if (suppressDragClick && e.detail > 0) {
        suppressDragClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  boardElement.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0 || gesture) return;
    const origin = e.target.closest('.sq.movable');
    if (!origin) return;
    const image = origin.querySelector('img');
    gesture = {
      id: e.pointerId,
      from: origin.dataset.square,
      origin,
      image,
      startX: e.clientX,
      startY: e.clientY,
      rect: image.getBoundingClientRect(),
      ghost: null,
      target: null,
    };
  });
  window.addEventListener('pointermove', (e) => {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    if (!g.ghost) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 5) return;
      if (!(e.buttons & 1) || !g.origin.isConnected) {
        cancelGesture();
        return;
      }
      boardElement.setPointerCapture(g.id);
      selected = focusSquare = g.from;
      candidates = game.moves(g.from);
      renderBoard();
      g.origin = boardElement.querySelector('[data-square="' + g.from + '"]');
      g.origin.classList.add('lifted');
      g.ghost = g.image.cloneNode(false);
      g.ghost.classList.remove('piece');
      g.ghost.classList.add('drag-ghost');
      g.ghost.setAttribute('aria-hidden', 'true');
      g.ghost.style.width = g.rect.width + 'px';
      g.ghost.style.height = g.rect.height + 'px';
      document.body.append(g.ghost);
      boardElement.classList.add('dragging');
    }
    const x = g.rect.left + e.clientX - g.startX,
      y = g.rect.top + e.clientY - g.startY;
    g.ghost.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    const cell = dropSquare(e.clientX, e.clientY);
    const target = cell?.matches('.legal,.capture') ? cell : null;
    if (g.target !== target) {
      g.target?.classList.remove('drop-target');
      target?.classList.add('drop-target');
      g.target = target;
    }
  });
  window.addEventListener('pointerup', (e) => {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    const target = g.ghost && dropSquare(e.clientX, e.clientY);
    releaseGesture();
    if (!g.ghost) return;
    if (target?.matches('.legal,.capture')) chooseSquare(target.dataset.square);
    else {
      resetSelection();
      renderBoard();
    }
  });
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === gesture?.id) cancelGesture();
  });
  boardElement.addEventListener('lostpointercapture', (e) => {
    if (e.target === boardElement && e.pointerId === gesture?.id)
      cancelGesture();
  });
  window.addEventListener('blur', cancelGesture);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && targeting) {
        resetSelection();
        render();
      }
      if (e.key === 'Escape' && gesture) cancelGesture();
    },
    true,
  );
  $('board').addEventListener('click', (e) => {
    const sq = e.target.closest('[data-square]');
    if (sq) chooseSquare(sq.dataset.square);
  });
  $('board').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resetSelection();
      renderBoard();
      return;
    }
    const offsets = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!offsets[e.key]) return;
    e.preventDefault();
    const cells = Array.from($('board').children),
      index = cells.indexOf(e.target);
    if (index < 0) return;
    const cols = boardElement.classList.contains('house-board') ? 9 : 8;
    const [dx, dy] = offsets[e.key],
      col = (index % cols) + dx,
      row = Math.floor(index / cols) + dy;
    if (col < 0 || col >= cols || row < 0 || row > 7) return;
    const next = cells[row * cols + col];
    if (!next.dataset.square) return;
    e.target.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
    focusSquare = next.dataset.square;
  });
  $('promotion-options').addEventListener('click', (e) => {
    const piece = e.target.closest('button')?.dataset.piece;
    if (!piece || !promote) return;
    const { from, to } = promote;
    $('promotion').close();
    makeMove(from, to, piece);
  });
  function playCalamity(victims) {
    if (!victims?.length) return false;
    window.StandEffects.stop();
    playClip('calamity');
    window.BoardStandFX.playCalamities(victims);
    return true;
  }
  function playStand(id, target, expected) {
    window.StandEffects.stop();
    window.BoardStandFX.stop();
    stopAudio();
    if (id === 'world' || id === 'crimson' || id === 'resume') {
      window.StandEffects.play(
        id === 'world' ? 'b' : id === 'crimson' ? 'w' : id,
        sound,
      );
      if (id !== 'resume') playClip(id === 'world' ? 'world-call' : 'diavolo');
      return;
    }
    playClip(id === 'shot' ? 'enigma-shot' : id);
    if (extraStands.includes(id) || id === 'shot') {
      window.BoardStandFX.play(
        id,
        target ||
          (id === 'superfly'
            ? game.state.tower
            : id === 'house' && game.state.position
              ? 'i4'
              : null) ||
          'e4',
        expected,
      );
      return;
    }
    const piece = target && game.chess.get(target);
    if (
      piece &&
      (!expected ||
        (piece.type === expected.type && piece.color === expected.color))
    )
      window.PieceEffects.play(id, target);
  }
  function effectSquare(id, color, target, choice) {
    if (id === 'kiss') return choice;
    if (id === 'wonder')
      return Object.entries(game.state.position.units).find(
        ([, piece]) => piece.type === 'k' && piece.color === color,
      )?.[0];
    return target;
  }
  function useStand(color, target, choice) {
    if (online.id) {
      if (online.side === color)
        online.act({ type: 'ability', target, choice }).catch(roomActionError);
      return;
    }
    track();
    if (!game.activate(color, target, choice)) {
      if (debug) debugUndo.pop();
      return;
    }
    changed();
    if (playCalamity(game.state.events.at(-1)?.calamity)) return;
    const id = game.state.stands[color];
    playStand(id, effectSquare(id, color, target, choice));
  }
  for (const color of ['w', 'b']) {
    const btn = node('button', 'tool-button', 'Снять наклейку');
    btn.id = 'merge-' + color;
    $('power-' + color).after(btn);
    btn.hidden = true;
    btn.onclick = () => {
      if (online.id) {
        online.act({ type: 'merge' }).catch(roomActionError);
        return;
      }
      const l = game.state.position?.links.find((l) => l.owner === color);
      if (!l || !game.canMerge(color)) return;
      track();
      if (game.merge(color)) {
        changed();
        if (!playCalamity(game.state.events.at(-1)?.calamity))
          playStand('kiss', l.original);
      }
    };
  }
  for (const color of ['w', 'b'])
    $('power-' + color).addEventListener('click', () => {
      if (game.state.stands[color] === 'superfly') {
        showTowerZone = !showTowerZone;
        render();
        if (showTowerZone) playStand('superfly', game.state.tower);
        return;
      }
      if (game.state.stands[color] === 'house') {
        playStand('house', 'i4');
        return;
      }
      if (game.abilityBlock(color) || !mayPlay()) return;
      if (
        ['diamond', 'echoes', 'kiss', 'gold', 'heaven', 'sticky'].includes(
          game.state.stands[color],
        )
      ) {
        const next = targeting === color ? null : color;
        resetSelection();
        targeting = next;
        render();
        if (next)
          boardElement
            .querySelector('.stand-target')
            ?.focus({ preventScroll: false });
        return;
      }
      useStand(color);
    });
  $('flip').onclick = () => {
    cancelGesture();
    flipped = !flipped;
    if (!online.id) storage.write('flipped', flipped ? 'yes' : 'no');
    renderBoard();
    renderPlayers();
  };
  $('sound-toggle').onclick = () => {
    sound = !sound;
    storage.write('sound', sound ? 'on' : 'off');
    if (!sound) stopAudio();
    window.StandEffects.setSound(sound);
    renderSound();
  };
  function roomURL(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('room', id);
    else url.searchParams.delete('room');
    url.hash = '';
    return url;
  }
  function roomFeedback(text = '') {
    $('online-feedback').hidden = !text;
    $('online-feedback').textContent = text;
  }
  function renderRoomDialog() {
    const active = Boolean(online.id),
      invite = invitedRoom();
    $('invite-tools').hidden = !active;
    $('seat-stand-label').hidden = active || location.protocol === 'file:';
    $('room-enter').hidden = active || location.protocol === 'file:';
    $('online-public').hidden =
      location.protocol !== 'file:' &&
      !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    $('room-enter').disabled = enteringRoom || location.protocol === 'file:';
    $('room-board').hidden = !active;
    $('room-leave').hidden = !active && !invite;
    $('room-enter').textContent = enteringRoom
      ? 'Подключение…'
      : invite
        ? 'Войти за чёрных'
        : 'Создать комнату';
    if (active) {
      $('invite-url').value = roomURL(online.id).href;
      $('online-info').textContent = !online.connected
        ? 'Восстанавливаем связь с комнатой…'
        : online.ready
          ? 'Оба игрока в комнате. Вы играете за ' +
            (online.side === 'w' ? 'белых.' : 'чёрных.')
          : 'Вы играете за белых. Отправьте другу ссылку, чтобы он занял место чёрных.';
    } else {
      $('online-info').textContent =
        location.protocol === 'file:'
          ? 'Для игры по сети откройте StandChess на сервере.'
          : invite
            ? 'Вас пригласили в партию. Войдите в комнату, чтобы играть за чёрных.'
            : 'Создайте комнату и отправьте другу ссылку. Вы играете за белых, друг — за чёрных.';
    }
  }
  function revealRoom() {
    $('seat-stand').value = invitedRoom() ? 'world' : 'crimson';
    roomFeedback();
    renderRoomDialog();
    if (!$('online').open) $('online').showModal();
  }
  function restoreLocalRoom() {
    review = null;
    online.reset();
    history.replaceState(null, '', roomURL(null));
    game = mainGame;
    flipped = storage.read('flipped') === 'yes';
    window.StandEffects.stop();
    resetSelection();
    render();
  }
  function roomConnectionChanged(message) {
    if (message) {
      restoreLocalRoom();
      revealRoom();
      roomFeedback(message);
    } else render();
  }
  function roomActionError(error) {
    toast(error.message || 'Не удалось передать ход.');
  }
  function applyRoomState(data, first) {
    const previous = game.state;
    game = StandGame.restore(data.state);
    if (first) {
      review = null;
      flipped = data.side === 'b';
      showTowerZone = true;
      history.replaceState(null, '', roomURL(online.id));
      window.StandEffects.stop();
    }
    resetSelection();
    render();
    if (!first && !review) {
      const hits = [];
      let effect = null,
        target = null,
        expected = null;
      let frozen = previous.freeze;
      for (const event of data.state.events.slice(previous.events.length)) {
        if (event.calamity) hits.push(...event.calamity);
        if (event.kind === 'ability') {
          effect = game.state.stands[event.color];
          target = effectSquare(
            effect,
            event.color,
            event.target,
            event.choice,
          );
          expected = event.piece
            ? {
                type: event.piece,
                color:
                  effect === 'echoes'
                    ? event.color === 'w'
                      ? 'b'
                      : 'w'
                    : event.color,
              }
            : null;
          frozen = effect === 'world' ? 2 : 0;
        } else if (event.kind === 'merge') {
          effect = 'kiss';
          target = event.target;
        } else if (event.kind === 'move') {
          moveSound(event.captured);
          if (event.shot) {
            effect = 'shot';
            target = event.to;
            expected = { color: event.color, type: event.walk || event.piece };
          } else if (event.to?.[0] === 'i') {
            effect = 'house';
            target = event.to;
          }
          if (frozen && --frozen === 0) effect = 'resume';
        }
      }
      if (frozen && !data.state.freeze) effect = 'resume';
      if (!playCalamity(hits) && effect) playStand(effect, target, expected);
    }
    if (online.ready && (first || data.version === 2) && $('online').open)
      $('online').close();
    if (
      online.ready &&
      (first || data.version === 2) &&
      !game.state.events.length
    )
      passiveIntro();
  }
  async function enterRoom(op) {
    if (enteringRoom) return;
    const id = invitedRoom() || online.random(12);
    enteringRoom = true;
    roomFeedback();
    renderRoomDialog();
    try {
      await online.enter(id, op, $('seat-stand').value);
    } catch (e) {
      if (!$('online').open) $('online').showModal();
      if (e.status === 404 && !op)
        history.replaceState(null, '', roomURL(null));
      roomFeedback(
        e.status
          ? e.message
          : 'Не удалось связаться с сервером. Попробуйте ещё раз.',
      );
    } finally {
      enteringRoom = false;
      renderRoomDialog();
    }
  }
  $('online-open').onclick = revealRoom;
  $('room-enter').onclick = () => enterRoom(invitedRoom() ? 'join' : 'create');
  function leaveMatch() {
    if (enteringRoom) return;
    $('online').close();
    restoreLocalRoom();
    stopAudio();
  }
  $('leave-match').onclick = leaveMatch;
  $('room-leave').onclick = leaveMatch;
  $('invite-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('invite-url').value);
      roomFeedback('Ссылка скопирована.');
    } catch {
      $('invite-url').select();
      roomFeedback('Ссылка выделена для копирования.');
    }
  };
  for (const field of ['pick-w', 'pick-b', 'seat-stand']) {
    for (const [id, stand] of Object.entries(STANDS))
      $(field).add(new Option(stand.name, id));
  }
  $('new-game').onclick = () => {
    for (const side of ['w', 'b'])
      $('pick-' + side).value = game.state.stands[side];
    $('restart-note').textContent = debug
      ? 'Тестовая доска вернётся в начальную позицию. Основная партия сохранена.'
      : 'Текущая партия и её журнал будут сброшены. Оба игрока начнут с 0 маны.';
    $('restart').showModal();
  };
  $('restart-confirm').onclick = () => {
    track();
    showTowerZone = true;
    game = new StandGame(undefined, 0, {
      w: $('pick-w').value,
      b: $('pick-b').value,
    });
    if (!debug) mainGame = game;
    $('scenario-hint').textContent = 'Тестовая партия с начальной позиции.';
    $('restart').close();
    stopAudio();
    changed();
    passiveIntro();
  };
  function passiveIntro() {
    const house = Object.values(game.state.stands).includes('house');
    if (game.state.tower) {
      playStand('superfly', game.state.tower);
      if (house) {
        const initial = game;
        setTimeout(() => {
          if (
            game === initial &&
            !game.state.events.length &&
            !document.querySelector('dialog[open]')
          )
            playStand('house', 'i4');
        }, 3150);
      }
    } else if (house) playStand('house', 'i4');
  }
  $('choose-stands').onclick = () => $('new-game').click();
  for (const [id, spec] of Object.entries(scenarios)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = spec.label;
    $('scenario').append(opt);
  }
  $('scenario').onchange = () =>
    ($('scenario-preview').textContent = scenarios[$('scenario').value].hint);
  $('scenario').onchange();
  $('debug-open').onclick = () => {
    if (review) seek(game.state.events.length);
    if (!debug) {
      game = StandGame.restore(mainGame.snapshot());
      debug = true;
      debugUndo = [];
      resetSelection();
      $('scenario-hint').textContent = 'Тестовая копия партии';
      render();
    }
    $('debug-feedback').textContent = '';
    $('debug').showModal();
  };
  $('load-scenario').onclick = () => {
    const id = $('scenario').value;
    track();
    showTowerZone = true;
    game = scenario(id);
    $('scenario-hint').textContent = scenarios[id].hint;
    $('debug').close();
    changed();
    passiveIntro();
  };
  $('debug-undo').onclick = () => {
    if (!debugUndo.length) return;
    game = StandGame.restore(debugUndo.pop());
    $('scenario-hint').textContent = 'Тестовая копия партии';
    changed();
    $('debug-feedback').textContent = 'Последнее действие отменено.';
  };
  $('recharge').onclick = () => {
    track();
    if (game.recharge()) {
      changed();
      $('debug-feedback').textContent = 'Мана обоих игроков заполнена.';
    } else debugUndo.pop();
  };
  for (const id of extraStands) {
    const btn = node('button', 'sample ' + id, STANDS[id].name);
    btn.dataset.preview = id;
    $('extra-previews').append(btn);
  }
  const accidentPreview = node('button', 'sample wonder', 'Случайное бедствие');
  accidentPreview.dataset.preview = 'calamity';
  $('extra-previews').append(accidentPreview);
  for (const el of document.querySelectorAll('[data-sample]'))
    el.onclick = () => playClip(el.dataset.sample, true);
  for (const el of document.querySelectorAll('[data-preview]'))
    el.onclick = () => {
      const color = el.dataset.preview;
      $('debug').close();
      stopAudio();
      if (color === 'calamity') {
        const square =
          ['e4', 'd4', 'e5', 'd5'].find((s) => !game.chess.get(s)) || 'e4';
        playCalamity([{ square, type: 'r', color: 'b' }]);
      } else if (
        color === 'echoes' ||
        color === 'diamond' ||
        color === 'sticky'
      ) {
        const preferred = color === 'echoes' ? 'g8' : 'e2';
        const square = game.chess.get(preferred)
          ? preferred
          : [...boardElement.children].find((cell) =>
              game.chess.get(cell.dataset.square),
            )?.dataset.square;
        playStand(color, square);
      } else if (extraStands.includes(color))
        playStand(
          color,
          color === 'superfly'
            ? game.state.tower || 'd4'
            : color === 'house' &&
                boardElement.classList.contains('house-board')
              ? 'i4'
              : 'e4',
        );
      else playStand({ w: 'crimson', b: 'world', resume: 'resume' }[color]);
    };
  $('exit-debug').onclick = () => {
    review = null;
    window.StandEffects.stop();
    debug = false;
    game = mainGame;
    debugUndo = [];
    stopAudio();
    resetSelection();
    render();
    toast('Основная партия восстановлена.');
  };
  for (const el of document.querySelectorAll('.close'))
    el.onclick = () => el.closest('dialog').close();
  for (const dlg of document.querySelectorAll('dialog'))
    dlg.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open') {
        cancelGesture();
        window.StandEffects.stop();
        stopAudio();
      }
    });
  for (const dlg of document.querySelectorAll('dialog'))
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const box = dlg.getBoundingClientRect();
      if (
        e.clientX < box.left ||
        e.clientX > box.right ||
        e.clientY < box.top ||
        e.clientY > box.bottom
      )
        dlg.close();
    });
  render();
  if (invitedRoom() && location.protocol !== 'file:') {
    revealRoom();
    if (online.saved(invitedRoom())) enterRoom('');
  } else if (new URL(location.href).searchParams.get('online') === '1') {
    history.replaceState(null, '', location.pathname);
    revealRoom();
  }
})();
