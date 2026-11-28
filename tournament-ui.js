(() => {
  'use strict';
  const $ = (id) => document.getElementById(id),
    panel = $('cup-panel'),
    content = $('cup-content'),
    message = $('cup-message');
  let profile,
    status,
    cache = '',
    busy = false,
    epoch = 0,
    authKey = '',
    resume = new URL(location.href).searchParams.get('cup'),
    back = false,
    timer;
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  async function request(path = '', body) {
    const headers = {};
    if (profile?.state.user && !path.endsWith('/watch'))
      headers.Authorization = 'Bearer ' + (await profile.token());
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(
      StandRoom.tournamentBackend +
        '/api/tournament' +
        (path ? '/' + path : ''),
      {
        headers,
        method: body ? 'POST' : 'GET',
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(90000),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'Турнирный сервер недоступен.');
    return data;
  }
  function schedule() {
    clearTimeout(timer);
    if (panel.open)
      timer = setTimeout(refresh, watchId || lobbyId ? 1000 : 4500);
  }
  function button(text, fn, primary = false) {
    const b = el('button', text, primary ? 'cup-primary' : '');
    b.type = 'button';
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;
      epoch++;
      message.textContent = '';
      try {
        await fn();
      } catch (e) {
        message.textContent = e.message;
      } finally {
        busy = false;
        b.disabled = false;
        schedule();
      }
    };
    return b;
  }
  let lobbyId,
    watchId,
    detailClock,
    received,
    draftKey = '';
  const standName = (id) => window.StandChess.STANDS[id]?.name || '—';
  const endpoint = (id, op) => 'games/' + id + (op ? '/' + op : '');
  function leaveDraft() {
    if (lobbyId) {
      request(endpoint(lobbyId, 'depart'), {}).catch(() => {});
      if (!StandDuels.tournament()) {
        const url = new URL(location.href);
        url.searchParams.delete('cup');
        url.hash = 'tournament';
        history.replaceState(null, '', url);
      }
    }
    watchId = lobbyId = detailClock = null;
    draftKey = cache = '';
  }
  async function backToBracket() {
    leaveDraft();
    render(await request());
  }
  async function enterLobby(id) {
    if (
      StandDuels.active() &&
      StandDuels.active() !== id &&
      !StandDuels.tournament()?.clock?.ended
    )
      throw Error('Сначала выйдите из текущей партии.');
    const generation = epoch;
    const data = await request(endpoint(id, 'enter'), {});
    if (!panel.open || generation !== epoch) {
      if (!data.ready) request(endpoint(id, 'depart'), {}).catch(() => {});
      return;
    }
    lobbyId = id;
    watchId = null;
    draftKey = '';
    const url = new URL(location.href);
    url.searchParams.set('cup', id);
    history.replaceState(null, '', url);
    await renderLobby(id, data);
  }
  function clockNodes(names) {
    const clocks = el('div', null, 'cup-live-clocks');
    for (const side of ['w', 'b']) {
      const row = el('div');
      row.dataset.side = side;
      row.append(el('span', names[side]), el('b', '3:00:00'));
      clocks.append(row);
    }
    return clocks;
  }
  function synchronize(clock) {
    detailClock = clock;
    received = performance.now();
    paintClock();
  }
  async function renderLobby(id, data) {
    if (id !== lobbyId || !panel.open) return;
    if (data.clock.ended) {
      await backToBracket();
      message.textContent = 'Партия завершена. Счёт серии обновлён.';
      return;
    }
    if (data.ready) {
      await StandDuels.enterTournament(id, () => profile.token(), data);
      lobbyId = null;
      detailClock = null;
      panel.close();
      StandHome.board();
      paintClock();
      return;
    }
    synchronize(data.clock);
    const l = data.lobby,
      mine = l.side === data.side;
    const key = JSON.stringify([id, l, data.side, data.clock.running]);
    if (key === draftKey) return;
    draftKey = key;
    content.replaceChildren();
    const label = !data.clock.running
      ? 'Ожидаем соперника в лобби'
      : (l.step === 'ban' ? 'Бан стенда' : 'Выбор стенда') +
        ' · ' +
        (mine ? 'ваша очередь' : data.names[l.side]);
    content.append(el('h3', label), clockNodes(data.names));
    if (l.bans.some(Boolean))
      content.append(
        el(
          'p',
          'Баны серии · ' + l.bans.filter(Boolean).map(standName).join(' и '),
        ),
      );
    if (data.clock.running && mine) {
      const field = el(
        'label',
        l.step === 'ban' ? 'Запретить для обоих' : 'Ваш стенд',
        'cup-draft-label',
      );
      const select = el('select');
      for (const [key, stand] of Object.entries(StandChess.STANDS))
        if (!l.bans.includes(key)) select.add(new Option(stand.name, key));
      field.append(select);
      content.append(
        field,
        button(
          l.step === 'ban' ? 'Забанить стенд' : 'Выбрать стенд',
          async () => {
            const response = await request(endpoint(id, l.step), {
              stand: select.value,
            });
            await renderLobby(id, response);
          },
          true,
        ),
      );
    }
    const nav = el('div', null, 'cup-buttons');
    nav.append(
      button('К сетке', backToBracket),
      button('Сдаться и выйти', async () => {
        await request(endpoint(id, 'leave'), {});
        await backToBracket();
      }),
    );
    content.append(nav);
    paintClock();
  }
  async function openWatch(id) {
    const data = await request(endpoint(id, 'watch'));
    if (!panel.open) return;
    watchId = id;
    draftKey = '';
    renderWatch(data);
  }
  function renderWatch(data) {
    synchronize(data.clock);
    const key = JSON.stringify([
      watchId,
      data.board,
      data.names,
      data.clock.ended,
    ]);
    if (key === draftKey) return;
    draftKey = key;
    const { board, names } = data;
    const end = data.clock.ended;
    const title = end
      ? end.winner
        ? 'Победа · ' + names[end.winner]
        : 'Ничья'
      : board
        ? 'Ход ' + (board.turn === 'w' ? 'белых' : 'чёрных')
        : data.clock.running
          ? 'Игроки выбирают стенды'
          : 'Ожидание игроков';
    content.replaceChildren(
      el('h3', names.w + ' — ' + names.b),
      el('p', title + ' · партия ' + data.number),
      clockNodes(names),
    );
    if (board) {
      const grid = el('div', null, 'cup-live-board');
      const house = Object.values(board.stands).includes('house');
      grid.style.setProperty('--files', house ? 9 : 8);
      grid.setAttribute('role', 'img');
      grid.setAttribute('aria-label', 'Позиция турнирной партии');
      for (let rank = 8; rank >= 1; rank--) {
        for (const [i, file] of Array.from(
          house ? 'abcdefghi' : 'abcdefgh',
        ).entries()) {
          const square = file + rank,
            cell = el('div');
          cell.dataset.square = square;
          if (file === 'i' && (rank < 3 || rank > 5)) {
            grid.append(cell);
            continue;
          }
          cell.className = (i + rank) % 2 ? 'dark' : 'light';
          if (board.last.includes(square)) cell.classList.add('last');
          if (Object.values(board.locked || {}).includes(square))
            cell.classList.add('locked');
          if (board.tower === square) cell.append(el('span', '♜', 'cup-tower'));
          for (const unit of board.pieces.filter((p) => p.square === square)) {
            const image = el('img');
            image.src = 'assets/mobile/' + unit.color + unit.type + '.png';
            image.alt = '';
            if (unit.transparent || unit.infinity) image.className = 'phased';
            cell.append(image);
          }
          if (file === 'a') cell.append(el('small', String(rank)));
          if (rank === 1) cell.append(el('small', file, 'file'));
          grid.append(cell);
        }
      }
      content.append(grid);
      const stands = el('div', null, 'cup-watch-stands');
      for (const side of ['w', 'b']) {
        const mana = board.mana?.[side];
        stands.append(
          el(
            'span',
            (side === 'w' ? 'Белые · ' : 'Чёрные · ') +
              standName(board.stands[side]) +
              (mana === undefined ? '' : ' · ' + mana + ' маны'),
          ),
        );
      }
      content.append(stands);
      if (board.power)
        content.append(el('p', 'Способность · ' + standName(board.power)));
    }
    content.append(button('К сетке', backToBracket));
    paintClock();
  }
  function login() {
    back = true;
    panel.close();
    StandProfile.open();
  }
  function render(data) {
    status = data;
    const signature = JSON.stringify([data, profile?.state.nick]);
    if (signature === cache) return;
    cache = signature;
    const previousScroll =
      content.querySelector('.cup-rounds')?.scrollLeft || 0;
    content.replaceChildren();
    const { tournament: t, me, registration: reg } = data;
    const names = new Map(t.players.map((p) => [p.id, p.nick]));
    const mutate = async (op, body = {}) => render(await request(op, body));
    $('cup-open').querySelector('small').textContent = reg
      ? 'Регистрация открыта · участников ' + t.players.length
      : t.champion
        ? 'Турнир завершён · итоги'
        : 'Турнир идёт · открыть сетку';
    if (reg) {
      content.append(
        el('h3', 'Регистрация открыта'),
        el('p', 'Нажмите на свободный слот, чтобы занять место в сетке.'),
      );
      const actions = el('div', null, 'cup-buttons');
      if (!me || !profile?.state.nick)
        actions.append(button('Войти для регистрации', login));
      else if (names.has(me.id))
        actions.append(
          button('Отменить регистрацию', () => mutate('withdraw')),
        );
      else
        actions.append(
          button(
            reg.full
              ? 'Расширить сетку и зарегистрироваться'
              : 'Зарегистрироваться',
            () => mutate('register'),
          ),
        );
      if (me?.organizer) {
        const go = button('Начать турнир', () => mutate('start'), true);
        go.disabled = t.players.length < 2;
        actions.append(go);
      }
      content.append(actions);
    } else if (t.champion)
      content.append(el('h3', 'Победитель · ' + names.get(t.champion)));
    else content.append(el('h3', 'Турнирная сетка'));
    const bracket = el('div', null, 'cup-rounds');
    for (const [r, matches] of (reg?.rounds || t.rounds).entries()) {
      const col = el('section', null, 'cup-round'),
        lanes = el('div', null, 'cup-lanes');
      col.append(
        el(
          'h3',
          matches.length === 1 ? 'Финал · BO5' : 'Раунд ' + (r + 1) + ' · BO3',
        ),
        lanes,
      );
      for (const [i, m] of matches.entries()) {
        const slot = el('div', null, 'cup-slot'),
          card = el('div', null, 'cup-pair');
        if (data.active === m.id) card.classList.add('active');
        for (const [j, uid] of m.players.entries()) {
          const index = i * 2 + j;
          const available = reg && !r && !uid;
          const line = available
            ? button('', () =>
                me && profile?.state.nick
                  ? mutate('register', { slot: index })
                  : login(),
              )
            : el('div');
          line.className =
            'cup-seat' +
            (uid ? ' occupied' : '') +
            (available ? ' available' : '');
          const number = reg && !r ? '#' + reg.seeds[index] : uid ? '♟' : '·';
          line.append(
            el('small', number),
            el(
              'span',
              uid ? names.get(uid) : available ? 'Занять слот' : 'Ожидание',
            ),
          );
          if (available)
            line.setAttribute('aria-label', 'Занять слот ' + reg.seeds[index]);
          if (uid && uid === me?.id) line.classList.add('mine');
          if (!reg && uid) line.append(el('b', String(m.wins[j])));
          if (m.winner && uid === m.winner) line.classList.add('won');
          card.append(line);
        }
        if (!reg && data.active === m.id) {
          const id = m.id + '-' + m.number,
            bar = el('div', null, 'cup-game-actions');
          bar.append(el('small', 'Партия ' + m.number));
          if (me && m.players.includes(me.id))
            bar.append(button('Войти в лобби', () => enterLobby(id), true));
          const eye = button('', () => openWatch(id));
          eye.className = 'cup-eye';
          eye.setAttribute('aria-label', 'Смотреть партию вживую');
          eye.title = 'Смотреть партию вживую';
          eye.append(el('i'));
          bar.append(eye);
          card.append(bar);
        }
        slot.append(card);
        lanes.append(slot);
      }
      bracket.append(col);
    }
    content.append(bracket);
    bracket.scrollLeft = previousScroll;
  }
  async function refresh() {
    if (!panel.open || busy) return;
    const n = ++epoch;
    try {
      const path = watchId
        ? endpoint(watchId, 'watch')
        : lobbyId
          ? endpoint(lobbyId)
          : '';
      const data = await request(path);
      if (n !== epoch || !panel.open) return;
      message.textContent = '';
      if (watchId) renderWatch(data);
      else if (lobbyId) await renderLobby(lobbyId, data);
      else {
        render(data);
        if (resume && profile?.state.nick && data.me) {
          const id = resume;
          resume = null;
          if (/^r\d+m\d+-\d+$/.test(id)) await enterLobby(id);
        }
      }
    } catch (e) {
      if (n === epoch) message.textContent = e.message;
    } finally {
      if (n === epoch) schedule();
    }
  }

  function open() {
    if (!panel.open) panel.showModal();
    if (!status) content.textContent = 'Загрузка турнира…';
    if (!profile)
      StandProfile.load()
        .then((api) => {
          profile = api;
          if (api.state.ready) refresh();
        })
        .catch((e) => {
          message.textContent = e.message;
        });
    refresh();
  }
  function paintClock() {
    const cup = StandDuels.tournament();
    function update(container, clock, receivedAt) {
      if (!container || !clock) return;
      for (const side of ['w', 'b']) {
        const node = container.querySelector('[data-side=' + side + ']');
        const seconds = Math.ceil(
          Math.max(
            0,
            clock.left[side] -
              (clock.running === side ? performance.now() - receivedAt : 0),
          ) / 1000,
        );
        node.querySelector('b').textContent =
          Math.floor(seconds / 3600) +
          ':' +
          String(Math.floor(seconds / 60) % 60).padStart(2, '0') +
          ':' +
          String(seconds % 60).padStart(2, '0');
        node.classList.toggle('running', clock.running === side);
      }
    }
    update($('cup-clocks'), cup?.clock, cup?.received);
    update(content.querySelector('.cup-live-clocks'), detailClock, received);
  }
  panel.addEventListener('close', () => {
    leaveDraft();
    clearTimeout(timer);
    epoch++;
    if (location.hash === '#tournament')
      history.replaceState(
        null,
        '',
        location.pathname + location.search + '#home',
      );
  });
  $('cup-open').onclick = open;
  $('cup-board-link').onclick = open;
  $('cup-report-link').onclick = () => {
    $('review-dialog').close();
    open();
  };
  $('social-panel').addEventListener('close', () => {
    if (back) {
      back = false;
      open();
    }
  });
  window.addEventListener('stand-social-change', () => {
    const key = String(profile?.state.user?.uid) + ':' + profile?.state.nick;
    if (key !== authKey) {
      authKey = key;
      if (panel.open) refresh();
    }
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#tournament') open();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && panel.open) refresh();
  });
  window.StandCup = { open };
  let watching = false;
  setInterval(async () => {
    if (
      watching ||
      document.hidden ||
      document.documentElement.dataset.view !== 'home' ||
      document.querySelector('dialog[open]') ||
      status?.tournament.phase !== 'registration' ||
      !status.me ||
      !status.tournament.players.some((p) => p.id === status.me.id)
    )
      return;
    watching = true;
    try {
      const data = await request();
      if (
        !panel.open &&
        document.documentElement.dataset.view === 'home' &&
        !document.querySelector('dialog[open]') &&
        data.tournament.phase === 'playing' &&
        data.me &&
        data.tournament.players.some((p) => p.id === data.me.id)
      ) {
        open();
        render(data);
      }
    } catch {
    } finally {
      watching = false;
    }
  }, 10000);
  setInterval(paintClock, 500);
  if (location.hash === '#tournament' || resume) open();
})();
