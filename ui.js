(() => {
  'use strict';
  const { StandGame, scenarios, scenario, MAX_MANA, STANDS, DEFAULT_STANDS } =
    window.StandChess;
  const $ = (id) => document.getElementById(id);
  const icons = {
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
  let gesture = null,
    suppressDragClick = false;
  const boardElement = $('board');
  const online = new window.StandRoom(applyRoomState, roomConnectionChanged);
  const roomParam = () => new URL(location.href).searchParams.get('room');
  const invitedRoom = () =>
    /^[0-9a-f]{24}$/.test(roomParam() || '') ? roomParam() : null;
  let enteringRoom = false;
  const mayPlay = () =>
    !online.id ||
    (online.ready &&
      online.connected &&
      !online.busy &&
      online.side === game.turn());
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
    resetSelection();
    if (!debug && !online.id)
      storage.write('match', JSON.stringify(game.snapshot()));
    render();
  }
  function renderBoard() {
    const files = Array.from(flipped ? 'hgfedcba' : 'abcdefgh');
    const ranks = Array.from(flipped ? '12345678' : '87654321');
    const board = $('board'),
      fragment = document.createDocumentFragment(),
      inCheck = game.chess.in_check(),
      playing = !game.result() && mayPlay();
    const abilityTargets = targeting ? game.targets(targeting) : [];
    for (const rank of ranks)
      for (const file of files) {
        const square = file + rank,
          piece = game.chess.get(square),
          cell = document.createElement('button');
        const target = candidates.some((m) => m.to === square);
        cell.type = 'button';
        cell.dataset.square = square;
        cell.className = 'sq';
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
        const label =
          square +
          (piece
            ? ', ' + sides[piece.color] + ', ' + pieces[piece.type]
            : ', пусто') +
          (target ? ', доступный ход' : '') +
          (locked ? ', под действием Three Freeze' : '') +
          (abilityTarget ? ', цель стенда' : '');
        cell.setAttribute('aria-label', label);
        cell.setAttribute('aria-pressed', String(square === selected));
        if (file === files[0]) cell.append(node('span', 'coord rank', rank));
        if (rank === ranks[7]) cell.append(node('span', 'coord file', file));
        if (piece) {
          if (playing && !targeting && !locked && piece.color === game.turn())
            cell.classList.add('movable');
          const img = document.createElement('img');
          img.src =
            'assets/pieces/' + piece.color + piece.type.toUpperCase() + '.svg';
          img.alt = '';
          img.draggable = false;
          cell.append(img);
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
      (e) => (e.kind === 'move' || e.stand === 'diamond') && !e.erased,
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
            e.from + ' → ' + e.to + (e.erased ? ' · стёрт' : ''),
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
  function renderPlayers() {
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
  function render() {
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
    if (online.id && !result) {
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
      const blocked = game.abilityBlock(side),
        btn = $('power-' + side);
      btn.disabled =
        Boolean(blocked) || !mayPlay() || (online.id && online.side !== side);
      btn.title = blocked || 'Потратить 100 маны';
      let action = targeting === side ? 'Отмена выбора' : stand.action;
      if (blocked) {
        if (result) action = 'Партия завершена';
        else if (s.freeze) action = 'Время остановлено';
        else if (s.mana[side] < MAX_MANA) action = 'Нужно 100 маны';
        else if (color !== side)
          action = side === 'w' ? 'В ход белых' : 'В ход чёрных';
        else action = blocked;
      }
      btn.replaceChildren(node('i', '', ''), document.createTextNode(action));
      btn.firstChild.innerHTML = icon(blocked ? 'clock' : 'zap');
      btn.setAttribute('aria-label', stand.name + ' · ' + (blocked || action));
      const meter = $('mana-' + side);
      const value = s.mana[side];
      meter.setAttribute('aria-valuenow', String(value));
      meter.style.setProperty('--mana-fill', value / MAX_MANA);
      meter.querySelector('b').textContent = value + ' / ' + MAX_MANA;
    }
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
    $('target-hint').hidden = !targeting;
    if (targeting)
      $('target-hint').textContent =
        s.stands[targeting] === 'echoes'
          ? 'Выберите фигуру соперника, которую прижмёт Echoes.'
          : 'Выберите подсвеченную стартовую клетку для восстановления.';
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
    if (wasFrozen && (!game.state.freeze || game.result()))
      window.StandEffects.play('resume', sound);
  }
  function chooseSquare(square) {
    focusSquare = square;
    if (game.result() || !mayPlay()) return;
    if (targeting) {
      if (game.targets(targeting).includes(square)) useStand(targeting, square);
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
      g.ghost.className = 'drag-ghost';
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
    const [dx, dy] = offsets[e.key],
      col = (index % 8) + dx,
      row = Math.floor(index / 8) + dy;
    if (col < 0 || col > 7 || row < 0 || row > 7) return;
    const next = cells[row * 8 + col];
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
  function playStand(id, target) {
    window.StandEffects.stop();
    stopAudio();
    if (id === 'world' || id === 'crimson' || id === 'resume') {
      window.StandEffects.play(
        id === 'world' ? 'b' : id === 'crimson' ? 'w' : id,
        sound,
      );
      return;
    }
    playClip(id);
    const cell = boardElement.querySelector('[data-square="' + target + '"]');
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const burst = node('div', 'stand-burst ' + id, '');
    burst.setAttribute('aria-hidden', 'true');
    Object.assign(burst.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    for (let n = 0; n < 8; n++) {
      const ray = document.createElement('i');
      ray.style.setProperty('--angle', 45 * n + 'deg');
      burst.append(ray);
    }
    document.body.append(burst);
    setTimeout(() => burst.remove(), 950);
  }
  function useStand(color, target) {
    if (online.id) {
      if (online.side === color)
        online.act({ type: 'ability', target }).catch(roomActionError);
      return;
    }
    track();
    if (!game.activate(color, target)) {
      if (debug) debugUndo.pop();
      return;
    }
    changed();
    playStand(game.state.stands[color], target);
  }
  for (const color of ['w', 'b'])
    $('power-' + color).addEventListener('click', () => {
      if (game.abilityBlock(color) || !mayPlay()) return;
      if (['diamond', 'echoes'].includes(game.state.stands[color])) {
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
      flipped = data.side === 'b';
      history.replaceState(null, '', roomURL(online.id));
      window.StandEffects.stop();
    }
    resetSelection();
    render();
    if (!first) {
      let effect = null,
        target = null;
      let frozen = previous.freeze;
      for (const event of data.state.events.slice(previous.events.length)) {
        if (event.kind === 'ability') {
          effect = game.state.stands[event.color];
          target = event.target;
          frozen = effect === 'world' ? 2 : 0;
        } else if (event.kind === 'move') {
          moveSound(event.captured);
          if (frozen && --frozen === 0) effect = 'resume';
        }
      }
      if (frozen && !data.state.freeze) effect = 'resume';
      if (effect) playStand(effect, target);
    }
    if (online.ready && (first || data.version === 2) && $('online').open)
      $('online').close();
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
  $('room-leave').onclick = () => {
    if (enteringRoom) return;
    $('online').close();
    restoreLocalRoom();
  };
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
    game = new StandGame(undefined, 0, {
      w: $('pick-w').value,
      b: $('pick-b').value,
    });
    if (!debug) mainGame = game;
    $('scenario-hint').textContent = 'Тестовая партия с начальной позиции.';
    $('restart').close();
    stopAudio();
    changed();
  };
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
    game = scenario(id);
    $('scenario-hint').textContent = scenarios[id].hint;
    $('debug').close();
    changed();
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
      $('debug-feedback').textContent = 'У каждого игрока 100 маны.';
    } else debugUndo.pop();
  };
  for (const el of document.querySelectorAll('[data-sample]'))
    el.onclick = () => playClip(el.dataset.sample, true);
  for (const el of document.querySelectorAll('[data-preview]'))
    el.onclick = () => {
      const color = el.dataset.preview;
      $('debug').close();
      stopAudio();
      if (color === 'echoes' || color === 'diamond')
        playStand(color, color === 'echoes' ? 'g8' : 'e2');
      else window.StandEffects.play(color, sound);
    };
  $('exit-debug').onclick = () => {
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
