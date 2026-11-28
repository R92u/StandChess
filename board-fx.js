(() => {
  'use strict';
  const layer = document.getElementById('stand-fx'),
    board = document.getElementById('board');
  const dial =
    '<g class="dust-dial" stroke="#ffe2a1"><circle cx="50" cy="50" r="37" fill="#331b49" fill-opacity=".72"/><circle cx="50" cy="50" r="34" fill="none" stroke="#d475b4"/>' +
    Array.from(
      { length: 12 },
      (_, i) => '<path d="M50 18v5" transform="rotate(' + i * 30 + ' 50 50)"/>',
    ).join('') +
    '<g class="dust-hands"><path d="M50 26v24l16 8" stroke-width="3" fill="none"/><circle cx="50" cy="50" r="3" fill="#fff1bb"/></g></g>';
  const burst =
    '<g class="dust-burst" fill="none"><circle cx="50" cy="50" r="26" stroke="#ffa6ce" stroke-width="4"/><circle cx="50" cy="50" r="33" stroke="#ffdc84"/>' +
    Array.from(
      { length: 18 },
      (_, i) =>
        '<path d="M50 18l2 -11 -3 5" transform="rotate(' +
        i * 20 +
        ' 50 50)" fill="#ffe8b5" stroke="#f598c3"/>',
    ).join('') +
    '</g>';
  const marks = {
    dust: dial,
    detonate: dial + burst,
    sticky:
      '<g class="zip-opening"><path d="M33 79Q39 56 48 45T68 18Q60 43 53 54T33 79Z" fill="#183447" stroke="#83c6d4"/><path d="M32 80Q39 55 48 44T67 17M34 81Q47 68 54 53T69 18" fill="none" stroke="#f2cf72" stroke-width="4" stroke-dasharray="2 4"/></g>' +
      '<g class="zip-slider" stroke="#573f26"><rect x="44" y="41" width="12" height="13" rx="3" fill="#ecc463" transform="rotate(30 50 48)"/><path d="m49 49-9 13a3 3 0 0 0 5 3l8-14z" fill="#ffdf89"/><path d="m46 57-3 5" stroke="#846431" stroke-width="1.5"/></g>',
    wonder:
      '<g class="wonder-rings" fill="none" stroke="#e3b9e5"><ellipse cx="50" cy="74" rx="35" ry="9"/><ellipse cx="50" cy="74" rx="26" ry="6"/></g>' +
      '<g class="wonder-hat"><path fill="#363243" d="m30 49 5-28q11-8 28-3l8 28 13 4q-17 12-66 4z"/><path fill="#a05662" d="m32 38 34-3 3 10-39 4z"/><path d="m41 23 12 2 7-4" fill="none" stroke="#d9b9ba"/><path d="m35 56 3 12 13 5 15-9 1-11" fill="#625968"/><path fill="#ce6872" d="m38 57 10 2-4 5-5-1zm15 2 9-5-2 8-6 2z"/></g>',
    enigma:
      '<g class="fold"><path fill="#faf1cf" d="m17 45 38-29 29 31-33 32z"/><path fill="#996ba4" d="m17 45 38-29-8 31 37 0-33 32-4-32z"/><path d="m26 47 21 0 7-20m-6 22 3 21"/></g>',
    shot: '<g class="rift"><ellipse cx="52" cy="87" rx="24" ry="5" fill="#391742"/></g><g class="prop"><path fill="#504659" d="m46 84-9-6 9-18 4-26 12 2-2 25-7 5z"/><path d="m47 57 10 2m-13-8 16 2" stroke="#e4d2ef"/></g><g class="flash"><path fill="#fff4af" d="m55 40-9-10 7 2 2-17 5 15 9-4-9 15z"/></g>',
    gold: '<g class="vine"><path d="M21 81Q38 69 41 51T72 18" fill="none" stroke="#ffdf65" stroke-width="4"/><path fill="#d7ee6e" d="M40 57Q17 55 20 40Q38 40 40 57Zm7-19q0-20 17-19-2 15-17 19zM35 67q12-20 26-14-8 15-26 14z"/></g><g class="gleam" fill="#fff3ab"><path d="m68 31 2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/></g>',
    kiss: '<g class="sticker"><path fill="#fa77a2" d="m15 48 21-14q8-5 14 2 7-7 15-2l21 14q-17 22-36 21T15 48z"/><path fill="#87305c" d="M22 49q17-3 28 0 12-3 28 0-28 13-56 0z"/></g><g class="link" fill="none" stroke="#ffd5e5"><ellipse cx="37" cy="54" rx="20" ry="13"/><ellipse cx="63" cy="54" rx="20" ry="13"/></g>',
    heaven:
      '<g class="pages"><path fill="#fff1be" d="M12 28q20-7 37 5 20-10 39-4l-3 42q-18-5-35 4-17-9-34-4z"/><path d="m49 34 1 39m-28-33 17 2m-16 7 15 3m20-10 21-4m-22 13 20-5"/></g><g class="quill"><path fill="#acdfd9" d="M33 71q23-43 48-47-3 26-48 47z"/><path d="m30 75 36-36"/></g>',
    house:
      '<g class="door"><path fill="#424e73" d="M24 81V25l40-9 13 8v57z"/><path fill="#8bd1de" d="m29 76 1-45 29-6-2 51z"/><path class="interior" fill="#e8cc97" d="m30 31 29-6 13 12-1 41-15-2z"/><circle cx="61" cy="54" r="2" fill="#41374c"/></g>',
    superfly:
      '<g class="pylon" fill="none" stroke="#fae2a0" stroke-width="2.6"><path d="m50 11-17 73h34zM32 26h36l-7 6H39zm-6 14h48l-8 6H34zm15 8 18 17m-2-17L38 67m-2 7 27-7M43 32l13 9"/></g><g class="field" fill="none" stroke="#ffe9a0"><ellipse cx="50" cy="79" rx="35" ry="9"/><ellipse cx="50" cy="79" rx="25" ry="5"/></g>',
  };
  const accidents = [
    '<g class="falling-sign"><path stroke="#bbb2b8" d="m35 18-1-9m31 10 2-12"/><rect x="22" y="19" width="56" height="33" rx="3" fill="#d18436"/><rect x="25" y="22" width="50" height="27" rx="2" fill="#f6d06f"/><path fill="#353543" stroke="none" d="m27 41 16-16h7L28 47h-1zm15 6 22-22h7L49 47zm21 0 10-10v7l-3 3z"/><g fill="#bb8043" stroke="none"><circle cx="29" cy="26" r="1.5"/><circle cx="72" cy="45" r="1.5"/></g></g>',
    '<g class="runaway-cart"><g stroke="#efe4bb" fill="none"><path d="M1 51h13M3 58h9"/></g><path d="m15 30 7 2 7 35h43l6-5" fill="none" stroke="#303b4a" stroke-width="5"/><path d="m25 40 44-4-1 24-39 3z" fill="#bf9169"/><path d="m26 39 16-9 27 6-28 5z" fill="#eecfaa"/><path d="m41 41 1 19m7-23 7 0v8l-6 1z" fill="#ecd5af" stroke="#947657"/><g fill="#283842" stroke="#d3c4ad" stroke-width="2.6"><circle cx="34" cy="72" r="5"/><circle cx="66" cy="72" r="5"/></g></g>',
    '<g class="burst-pipe"><path fill="#779996" d="m5 52 20-2 4-6 9-1 1 16-9 1-3-4-21 5z"/><path d="m20 49 3 11m7-16 2 16" stroke="#b6cebd"/><path d="m37 44 6-4-3 8 6 3-7 3 2 8-7-3" fill="#d2d8be"/></g>' +
      '<g class="water-jet" stroke="#d7fbff" stroke-width="1.2"><path d="m37 51 13-6 12 2 17-7-12 10 21-1-18 5 15 5-19-2 7 11-14-10-10 2z" fill="#68c4dc"/><path d="m47 51 11-1 9-3m-19 6 10 1" fill="none"/><path d="m70 37 5-5m7 28 6 3m-5-17 7-2"/></g>',
  ];
  const impact =
    '<g class="calamity-impact" fill="none" stroke="#fff0bc" stroke-width="2.4"><path d="m35 40-6-6m32 6 6-9m-4 27 10 4m-35-3-10 6m22-32-1-8"/><ellipse cx="50" cy="52" rx="19" ry="13" stroke-width="1.3"/></g>';
  let active = [],
    timer;
  function stop() {
    clearTimeout(timer);
    board.classList.remove('dust-rewind');
    board.querySelector('.dust-bait')?.classList.remove('dust-bait');
    for (const effect of active)
      if (effect.node !== layer) effect.node.remove();
    active = [];
    layer.hidden = true;
    layer.replaceChildren();
    delete layer.dataset.effect;
    delete layer.dataset.variant;
  }
  function sync() {
    if (!active.length) return;
    const base = board.getBoundingClientRect();
    for (const { node, square } of active) {
      const cell = board.querySelector('[data-square="' + square + '"]');
      node.hidden = !cell;
      if (!cell) continue;
      if (node.dataset.effect === 'detonate') {
        cell.classList.add('dust-bait');
        const origin = board.querySelector(
          '[data-square="' + node.dataset.from + '"]',
        );
        if (origin) {
          const a = origin.getBoundingClientRect(),
            b = cell.getBoundingClientRect();
          node.style.setProperty('--dust-x', a.left - b.left + 'px');
          node.style.setProperty('--dust-y', a.top - b.top + 'px');
        }
      }
      const rect = cell.getBoundingClientRect();
      node.style.left =
        ((rect.left - base.left + rect.width / 2) / base.width) * 100 + '%';
      node.style.top =
        ((rect.top - base.top + rect.height / 2) / base.height) * 100 + '%';
      node.style.width = (rect.width / base.width) * 165 + '%';
    }
  }
  function draw(node, id, square, victim) {
    active.push({ node, square });
    node.dataset.effect = id;
    let graphic = marks[id];
    if (id === 'calamity') {
      const choice = victim?.variant;
      const variant =
        Number.isInteger(choice) && choice >= 0 && choice < accidents.length
          ? choice
          : Math.floor(Math.random() * accidents.length);
      node.dataset.variant = variant;
      graphic = accidents[variant] + impact;
    }
    node.innerHTML =
      '<svg viewBox="0 0 100 100" stroke="#2b2634" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
      graphic +
      '</svg>';
    if (
      (id === 'shot' || id === 'calamity' || id === 'detonate') &&
      victim &&
      /^[wb]$/.test(victim.color) &&
      /^[pnbrqk]$/.test(victim.type)
    ) {
      const img = document.createElement('img');
      img.className =
        id === 'detonate'
          ? 'dust-attacker'
          : id === 'shot'
            ? 'shot-victim'
            : 'calamity-victim';
      img.alt = '';
      img.src =
        'assets/mobile/' + victim.color + (victim.walk || victim.type).toLowerCase() + '.png';
      node.prepend(img);
    }
  }
  function playCalamities(victims) {
    stop();
    for (const victim of victims) {
      const node = active.length ? document.createElement('div') : layer;
      if (node !== layer) {
        node.className = 'calamity-extra';
        node.setAttribute('aria-hidden', 'true');
        layer.after(node);
      }
      draw(node, 'calamity', victim.square, victim);
    }
    sync();
    timer = setTimeout(
      stop,
      matchMedia('(prefers-reduced-motion:reduce)').matches ? 400 : 1500,
    );
  }
  function play(id, square, victim) {
    if (id === 'calamity') return playCalamities([{ ...victim, square }]);
    stop();
    if (!marks[id]) return;
    if (id === 'detonate') {
      board.classList.add('dust-rewind');
      layer.dataset.from = victim?.from || square;
    }
    draw(layer, id, square, victim);
    sync();
    timer = setTimeout(
      stop,
      matchMedia('(prefers-reduced-motion:reduce)').matches
        ? 400
        : id === 'detonate'
          ? 1850
          : id === 'shot'
            ? 1450
            : 1250,
    );
  }
  window.addEventListener('pagehide', stop);
  window.BoardStandFX = { play, playCalamities, stop, sync };
})();
