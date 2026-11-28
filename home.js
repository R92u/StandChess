(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const panel = $('social-panel'),
    body = $('social-body'),
    feedback = $('social-feedback');
  let page = 'profile',
    account,
    loading,
    selected,
    drawn = '',
    previousUid = null,
    attemptedDuel = '';
  const currentDuel = () => new URL(location.href).searchParams.get('duel');
  function route() {
    const params = new URL(location.href).searchParams;
    const arena =
      location.hash === '#arena' ||
      (location.hash !== '#home' &&
        (params.has('room') || params.has('online')));
    document.documentElement.dataset.view = arena ? 'arena' : 'home';
    if (!arena) window.GojoFX?.stop();
  }
  function board() {
    if (location.hash !== '#arena') location.hash = 'arena';
    route();
  }
  window.StandHome = {
    board,
    route,
    position(label, started, finished) {
      $('home-position').textContent = label;
      $('dock-play').textContent = finished
        ? 'Посмотреть партию'
        : started
          ? 'Продолжить'
          : 'Играть';
      $('hero-play').firstChild.textContent = started ? 'К доске ' : 'Играть ';
    },
  };
  route();
  window.addEventListener('hashchange', route);
  const titles = {
    profile: 'Профиль',
    friends: 'Друзья',
    inbox: 'Приглашения',
    send: 'Вызов на дуэль',
    accept: 'Принять вызов',
  };
  function element(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function describe(error) {
    const messages = {
      'auth/popup-closed-by-user': 'Вы закрыли окно входа.',
      'auth/popup-blocked':
        'Разрешите всплывающее окно для входа через Google.',
      'auth/network-request-failed': 'Проверьте соединение и повторите вход.',
      'permission-denied':
        'Действие недоступно. Обновите список и проверьте аккаунт.',
      unavailable: 'Нет связи с Firebase. Попробуйте ещё раз.',
    };
    return (
      messages[error?.code] ||
      error?.message ||
      'Не удалось выполнить действие.'
    );
  }
  const say = (text) => {
    feedback.textContent = text;
  };
  function action(label, fn, primary = false) {
    const button = element(
      'button',
      label,
      'social-action' + (primary ? ' primary' : ''),
    );
    button.type = 'button';
    button.onclick = async () => {
      button.disabled = true;
      say('');
      try {
        await fn();
      } catch (e) {
        say(describe(e));
      } finally {
        button.disabled = false;
      }
    };
    return button;
  }
  function form(label, placeholder, button, fn) {
    const f = element('form'),
      l = element('label', label),
      input = element('input');
    input.required = true;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    const submit = element('button', button, 'social-action primary');
    f.onsubmit = async (e) => {
      e.preventDefault();
      submit.disabled = true;
      say('');
      try {
        await fn(input.value);
        input.value = '';
      } catch (error) {
        say(describe(error));
      } finally {
        submit.disabled = false;
      }
    };
    l.append(input);
    f.append(l, submit);
    return f;
  }
  const mine = () => account?.state.user?.uid;
  const other = (r) => (r.from === mine() ? r.to : r.from);
  const fresh = (r) =>
    (r.accepted || r.created)?.toMillis() > Date.now() - 86400000 || !r.created;
  async function enter(id) {
    attemptedDuel = id;
    const token = await account.token();
    await window.StandDuels.enter(id, token);
    try {
      sessionStorage.setItem('standchess.duel-open.' + id, '1');
    } catch {}
    paint();
    panel.close();
  }
  function change(next, person) {
    page = next;
    selected = person;
    drawn = '';
    say('');
    $('social-title').textContent = titles[next];
    paint();
  }
  function row(label, ...buttons) {
    const r = element('div', undefined, 'social-row'),
      c = element('div', undefined, 'social-controls');
    c.append(...buttons);
    r.append(element('strong', label), c);
    return r;
  }
  function invites() {
    const s = account.state;
    const requests = s.friends.filter((r) => r.status === 'pending');
    const duels = s.duels.filter(fresh);
    if (!requests.length && !duels.length)
      body.append(
        element('p', 'Здесь появятся заявки в друзья и вызовы на дуэль.'),
      );
    for (const r of requests) {
      const incoming = r.to === mine(),
        controls = [];
      if (incoming)
        controls.push(
          action('Принять', () => account.acceptFriend(r.id), true),
        );
      controls.push(
        action(incoming ? 'Отклонить' : 'Отозвать', () =>
          account.dismiss('friends', r.id),
        ),
      );
      body.append(
        row(
          account.nickOf(other(r)) +
            (incoming ? ' · в друзья' : ' · заявка отправлена'),
          ...controls,
        ),
      );
    }
    for (const r of duels) {
      const incoming = r.to === mine(),
        accepted = r.status === 'accepted',
        controls = [];
      if (accepted) controls.push(action('К доске', () => enter(r.id), true));
      else if (incoming)
        controls.push(action('Принять вызов', () => change('accept', r), true));
      if (!accepted)
        controls.push(
          action(incoming ? 'Отклонить' : 'Отозвать', () =>
            account.dismiss('duels', r.id),
          ),
        );
      body.append(
        row(
          account.nickOf(other(r)) +
            (accepted
              ? ' · дуэль'
              : incoming
                ? ' вызывает на дуэль'
                : ' · ожидаем ответа'),
          ...controls,
        ),
      );
    }
  }
  function paint() {
    if (!account) return;
    const s = account.state;
    const friends = s.friends.filter((r) => r.status === 'friends');
    const count =
      s.friends.filter((r) => r.to === mine() && r.status === 'pending')
        .length +
      s.duels.filter((r) => {
        if (!fresh(r)) return false;
        if (r.status === 'pending') return r.to === mine();
        try {
          return (
            r.from === mine() &&
            !sessionStorage.getItem('standchess.duel-open.' + r.id)
          );
        } catch {
          return false;
        }
      }).length;
    $('home-nickname').textContent =
      s.nick || (s.user ? 'Выберите ник' : 'Гость');
    const badge = document.querySelector('.social-count');
    badge.textContent = String(count);
    badge.hidden = !count;
    const cards = $('home-friends');
    if (friends.length || !cards.querySelector('.friend-empty')) {
      cards.replaceChildren();
      for (const r of friends) {
        const id = other(r),
          name = account.nickOf(id),
          button = element('button', undefined, 'friend-card');
        button.append(
          element('span', name.substring(0, 1), 'friend-avatar'),
          element('strong', name),
        );
        button.onclick = () => open('send', id);
        cards.append(button);
      }
      if (!friends.length) {
        const button = element('button', undefined, 'friend-empty');
        button.append(
          element('span', '+', 'friend-avatar'),
          element('span', 'Добавить друга'),
        );
        button.onclick = () => open('friends');
        cards.append(button);
      }
    }
    if (!panel.open) return;
    const key = JSON.stringify([
      page,
      selected,
      mine(),
      s.ready,
      s.nick,
      ...s.friends.map((r) => [r.id, r.status, account.nickOf(other(r))]),
      ...s.duels
        .filter(fresh)
        .map((r) => [r.id, r.status, account.nickOf(other(r))]),
    ]);
    if (key === drawn) return;
    drawn = key;
    const focused =
      body.contains(document.activeElement) &&
      document.activeElement.tagName === 'INPUT'
        ? document.activeElement
        : null;
    body.replaceChildren();
    if (!s.ready) body.append(element('p', 'Загрузка профиля…'));
    else if (!s.user) {
      body.append(
        element(
          'p',
          page === 'profile'
            ? 'Войдите через Google и выберите игровой ник.'
            : 'Войдите, чтобы добавлять друзей и играть с ними в дуэли.',
        ),
      );
      if (account.embedded) {
        const link = element(
          'a',
          'Открыть вход Google в браузере',
          'auth-external',
        );
        link.href = 'https://standchess-r92u.onrender.com/signin.html';
        body.append(
          link,
          form(
            'Одноразовый код из браузера',
            'Вставьте код',
            'Войти',
            account.redeemLoginCode,
          ),
        );
      } else
        body.append(action('Войти через Google', account.browserLogin, true));
    } else if (!s.nick) {
      body.append(
        form(
          'Игровой ник',
          'От 3 до 20 букв, цифр или _',
          'Сохранить ник',
          account.chooseNick,
        ),
        action('Выйти из аккаунта', account.logout),
      );
    } else if (page === 'profile') {
      body.append(
        element('h3', s.nick),
        element('p', 'Вход через Google'),
        action('Друзья', () => change('friends')),
        action('Выйти из аккаунта', account.logout),
      );
    } else if (page === 'send' || page === 'accept') {
      const accept = page === 'accept';
      const id = accept ? other(selected) : selected;
      const label = element('label', 'Ваш стенд'),
        select = element('select');
      for (const [key, stand] of Object.entries(window.StandChess.STANDS))
        select.add(new Option(stand.name, key));
      select.value = accept ? 'world' : 'crimson';
      label.append(select);
      body.append(
        element('p', 'Соперник · ' + account.nickOf(id)),
        label,
        action(
          accept ? 'Принять и играть' : 'Вызвать на дуэль',
          async () => {
            if (accept) {
              const duelId = selected.id;
              await account.acceptDuel(duelId, select.value);
              change('inbox');
              await enter(duelId);
            } else {
              await account.challenge(id, select.value);
              change('inbox');
              say('Вызов отправлен.');
            }
          },
          true,
        ),
        action('Назад', () => change(accept ? 'inbox' : 'friends')),
      );
    } else if (page === 'friends') {
      body.append(
        form(
          'Добавить по нику',
          'Ник друга',
          'Отправить заявку',
          async (value) => {
            await account.addFriend(value);
            say('Заявка отправлена.');
          },
        ),
        action('Заявки и дуэли' + (count ? ' · ' + count : ''), () =>
          change('inbox'),
        ),
      );
      if (friends.length) body.append(element('h3', 'Мои друзья'));
      for (const r of friends) {
        const id = other(r);
        body.append(
          row(
            account.nickOf(id),
            action('Вызвать на дуэль', () => change('send', id), true),
          ),
        );
      }
    } else invites();
    if (focused) {
      const input = body.querySelector('input');
      if (input && input.placeholder === focused.placeholder) {
        input.value = focused.value;
        input.focus();
      }
    }
  }
  function load() {
    if (!loading)
      loading = import('./social.js')
        .then((api) => {
          account = api;
          api.start();
          return api;
        })
        .catch((e) => {
          loading = null;
          throw e;
        });
    return loading;
  }
  async function open(next, person) {
    if (!panel.open) panel.showModal();
    change(next, person);
    if (!account) body.textContent = 'Загрузка…';
    try {
      await load();
      paint();
    } catch (e) {
      body.textContent = '';
      say(describe(e));
    }
  }
  $('home-profile').onclick = () => open('profile');
  document
    .querySelectorAll('[data-social]')
    .forEach((b) => (b.onclick = () => open(b.dataset.social)));
  window.addEventListener('stand-social-error', (e) => say(describe(e.detail)));
  window.addEventListener('stand-social-change', () => {
    const state = account.state,
      uid = mine();
    if (previousUid && previousUid !== uid) window.StandDuels?.leave();
    previousUid = uid || null;
    try {
      if (uid) localStorage.setItem('standchess.profile', '1');
      else if (state.ready) localStorage.removeItem('standchess.profile');
    } catch {}
    paint();
    const id = currentDuel();
    if (
      id &&
      state.ready &&
      state.nick &&
      attemptedDuel !== id &&
      /^[a-f0-9]{24}$/.test(id)
    ) {
      attemptedDuel = id;
      enter(id).catch(async (e) => {
        await open('inbox');
        say(describe(e));
      });
    }
  });
  try {
    if (currentDuel()) open('inbox');
    else if (localStorage.getItem('standchess.profile'))
      load().catch((e) => say(describe(e)));
  } catch {}
})();
