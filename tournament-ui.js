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
    pick = 'crimson',
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
    if (profile?.state.user)
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
    if (panel.open) timer = setTimeout(refresh, 4500);
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
  async function play(id, stand) {
    await StandDuels.enterTournament(id, () => profile.token(), stand, request);
    try {
      sessionStorage.setItem('standcup.' + id, stand);
    } catch {}
    panel.close();
    StandHome.board();
    paintClock();
  }
  function render(data) {
    status = data;
    const signature = JSON.stringify([data, profile?.state.nick]);
    if (signature === cache) return;
    cache = signature;
    content.replaceChildren();
    const { tournament: t, me } = data,
      name = (id) => t.players.find((p) => p.id === id)?.nick || 'Ожидание';
    $('cup-open').querySelector('small').textContent =
      t.phase === 'registration'
        ? 'Регистрация открыта · участников ' + t.players.length
        : t.phase === 'playing'
          ? 'Турнир идёт · открыть сетку'
          : 'Турнир завершён · итоги';
    const mutate = async (op) => render(await request(op, {}));
    if (t.phase === 'registration') {
      content.append(
        el('h3', 'Регистрация открыта'),
        el(
          'p',
          'У каждого по 3 часа на партию. Часы запускаются, когда оба соперника вошли в лобби.',
        ),
      );
      const actions = el('div', null, 'cup-buttons');
      if (!profile?.state.nick)
        actions.append(
          button(
            'Войти для регистрации',
            () => {
              back = true;
              panel.close();
              StandProfile.open();
            },
            true,
          ),
        );
      else if (t.players.some((p) => p.id === me?.id))
        actions.append(
          button('Отменить регистрацию', () => mutate('withdraw')),
        );
      else
        actions.append(
          button('Зарегистрироваться', () => mutate('register'), true),
        );
      if (me?.organizer) {
        const go = button('Начать турнир', () => mutate('start'), true);
        go.disabled = t.players.length < 2;
        actions.append(go);
      }
      content.append(actions, el('h3', 'Участники · ' + t.players.length));
      if (t.players.length) {
        const list = el('ul');
        for (const p of t.players)
          list.append(el('li', p.nick + (p.id === me?.id ? ' · вы' : '')));
        content.append(list);
      }
      return;
    }
    if (t.champion)
      content.append(el('h3', 'Победитель — ' + name(t.champion)));
    const mine = t.rounds
      .flat()
      .find(
        (m) =>
          !m.winner && m.players.every(Boolean) && m.players.includes(me?.id),
      );
    if (mine) {
      const box = el('section', null, 'cup-lobby'),
        id = mine.id + '-' + mine.number;
      box.append(
        el('h3', 'Ваше лобби'),
        el(
          'p',
          mine.players.map(name).join(' — ') +
            ' · ' +
            mine.wins.join(' : ') +
            ' · партия ' +
            mine.number,
        ),
      );
      const label = el('label', 'Ваш стенд'),
        select = el('select');
      for (const [key, stand] of Object.entries(StandChess.STANDS))
        select.add(new Option(stand.name, key));
      select.value = pick;
      select.onchange = () => {
        pick = select.value;
      };
      label.append(select);
      if (!mine.deadline && StandDuels.tournament()?.id !== id)
        box.append(label);
      box.append(button('Войти в лобби', () => play(id, select.value), true));
      content.append(box);
    } else if (!profile?.state.user) {
      content.append(
        button('Войти как участник', () => {
          back = true;
          panel.close();
          StandProfile.open();
        }),
      );
    }
    content.append(el('h3', 'Турнирная сетка'));
    const rounds = el('div', null, 'cup-rounds');
    for (const [r, matches] of t.rounds.entries()) {
      const col = el('section', null, 'cup-round');
      const lanes = el('div', null, 'cup-lanes');
      col.append(
        el(
          'h3',
          matches.length === 1
            ? 'Финал · BO5'
            : matches.length === 2
              ? 'Полуфинал · BO3'
              : 'Раунд ' + (r + 1) + ' · BO3',
        ),
      );
      for (const m of matches) {
        const card = el('div', null, 'cup-pair');
        for (const [i, id] of m.players.entries()) {
          const line = el(
            'span',
            id ? name(id) : r === 0 ? 'Свободный слот' : 'Ожидание',
            m.winner && id === m.winner ? 'won' : '',
          );
          line.append(el('b', String(m.wins[i])));
          card.append(line);
        }
        card.append(
          el(
            'small',
            m.winner
              ? m.players.every(Boolean)
                ? 'Серия завершена'
                : 'Проход без игры'
              : !m.players.every(Boolean)
                ? 'Ожидание соперников'
                : m.deadline
                  ? 'Идёт партия ' + m.number
                  : 'Лобби · партия ' + m.number,
          ),
        );
        const slot = el('div', null, 'cup-slot');
        slot.append(card);
        lanes.append(slot);
      }
      col.append(lanes);
      rounds.append(col);
    }
    content.append(rounds);
  }
  async function refresh() {
    if (!panel.open || busy) return;
    const n = ++epoch;
    try {
      const data = await request();
      if (n !== epoch || !panel.open) return;
      render(data);
      message.textContent = '';
      if (resume && profile?.state.nick && data.me) {
        const id = resume;
        resume = null;
        if (/^r\d+m\d+-\d+$/.test(id)) {
          let stand = pick;
          try {
            stand = sessionStorage.getItem('standcup.' + id) || stand;
          } catch {}
          await play(id, stand);
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
    if (!cup?.clock) return;
    const { left, running } = cup.clock;
    for (const side of ['w', 'b']) {
      const node = $('cup-clocks').querySelector('[data-side=' + side + ']');
      const seconds = Math.ceil(
        Math.max(
          0,
          left[side] -
            (running === side ? performance.now() - cup.received : 0),
        ) / 1000,
      );
      node.querySelector('b').textContent =
        Math.floor(seconds / 3600) +
        ':' +
        String(Math.floor(seconds / 60) % 60).padStart(2, '0') +
        ':' +
        String(seconds % 60).padStart(2, '0');
      node.classList.toggle('running', running === side);
    }
  }
  panel.addEventListener('close', () => {
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
