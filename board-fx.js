(() => {
  'use strict';
  const layer = document.getElementById('stand-fx'),
    board = document.getElementById('board');
  const marks = {
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
  let active = null,
    timer;
  function stop() {
    clearTimeout(timer);
    active = null;
    layer.hidden = true;
    layer.replaceChildren();
    delete layer.dataset.effect;
  }
  function sync() {
    if (!active) return;
    const cell = board.querySelector('[data-square="' + active + '"]');
    if (!cell) {
      stop();
      return;
    }
    const rect = cell.getBoundingClientRect(),
      base = board.getBoundingClientRect();
    layer.style.left =
      ((rect.left - base.left + rect.width / 2) / base.width) * 100 + '%';
    layer.style.top =
      ((rect.top - base.top + rect.height / 2) / base.height) * 100 + '%';
    layer.style.width = (rect.width / base.width) * 165 + '%';
  }
  function play(id, square, victim) {
    stop();
    if (!marks[id]) return;
    active = square;
    layer.dataset.effect = id;
    layer.hidden = false;
    layer.innerHTML =
      '<svg viewBox="0 0 100 100" stroke="#2b2634" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
      marks[id] +
      '</svg>';
    if (
      id === 'shot' &&
      victim &&
      /^[wb]$/.test(victim.color) &&
      /^[pnbrqk]$/.test(victim.type)
    ) {
      const img = document.createElement('img');
      img.className = 'shot-victim';
      img.alt = '';
      img.src =
        'assets/pieces/' + victim.color + victim.type.toUpperCase() + '.svg';
      layer.prepend(img);
    }
    sync();
    timer = setTimeout(
      stop,
      matchMedia('(prefers-reduced-motion:reduce)').matches
        ? 400
        : id === 'shot'
          ? 1450
          : 1250,
    );
  }
  window.addEventListener('pagehide', stop);
  window.BoardStandFX = { play, stop, sync };
})();
