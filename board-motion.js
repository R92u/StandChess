(() => {
  'use strict';
  const board = document.getElementById('board');
  const layer = document.getElementById('move-layer');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const flights = new Map();
  const square = (name) => board.querySelector('[data-square="' + name + '"]');

  function clear() {
    for (const flight of flights.values()) {
      flight.animation.cancel();
      flight.sprite.remove();
      square(flight.hide)?.classList.remove('motion-hidden');
    }
    flights.clear();
  }
  function sync() {
    for (const { hide } of flights.values())
      square(hide)?.classList.add('motion-hidden');
  }
  function bounds(name) {
    return flights.get(name)?.sprite.getBoundingClientRect();
  }
  function slide(from, to, pose, preview = false) {
    const start = square(from);
    const end = square(to);
    const image = (preview ? start : end)?.querySelector(
      'img:not(.revive-ghost)',
    );
    if (!start || !end || !image || reduced.matches) return;
    const box = end.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const origin = pose || start.getBoundingClientRect();
    const dx =
      ((origin.left + origin.width / 2 - box.left - box.width / 2) /
        box.width) *
      100;
    const dy =
      ((origin.top + origin.height / 2 - box.top - box.height / 2) /
        box.height) *
      100;
    const scale = origin.width / box.width;
    const grid = board.getBoundingClientRect();
    const sprite = image.cloneNode(false);
    sprite.classList.add('flying-piece');
    Object.assign(sprite.style, {
      left: ((box.left - grid.left) / grid.width) * 100 + '%',
      top: ((box.top - grid.top) / grid.height) * 100 + '%',
      width: (box.width / grid.width) * 100 + '%',
      height: (box.height / grid.height) * 100 + '%',
    });
    const hide = preview ? from : to;
    square(hide).classList.add('motion-hidden');
    layer.append(sprite);
    const transform = (progress, angle = 0, size = 1) =>
      'translate3d(' +
      dx * (1 - progress) +
      '%,' +
      dy * (1 - progress) +
      '%,0) rotate(' +
      angle +
      'deg) scale(' +
      size +
      ')';
    const tilt = Math.sign(dx);
    const frames = pose
      ? [{ transform: transform(0, 0, scale) }, { transform: transform(1) }]
      : [
          [0, 0, 0],
          [0.04, 0.33, 0],
          [0.08, 0.55, 0],
          [0.16, 0.73, 1],
          [0.28, 0.87, 2],
          [0.43, 0.97, 2],
          [0.53, 1, 0],
          [0.68, 1.022, -3],
          [0.83, 1.013, -2],
          [1, 1, 0],
        ].map(([offset, progress, angle]) => ({
          offset,
          transform: transform(progress, tilt * angle),
        }));
    const animation = sprite.animate(frames, {
      duration: pose ? 84 : 220,
      easing: pose ? 'cubic-bezier(.45,0,.55,1)' : 'linear',
      fill: 'both',
    });
    const flight = { sprite, animation, hide, preview, from };
    flights.set(to, flight);
    animation.onfinish = () => {
      if (flights.get(to) !== flight || flight.preview) return;
      square(hide)?.classList.remove('motion-hidden');
      sprite.remove();
      flights.delete(to);
    };
  }
  function play(move, reverse = false, dragPose = null) {
    if (move?.kind !== 'move' || move.shot || move.detonation) {
      clear();
      return;
    }
    const from = reverse ? move.to : move.from;
    const to = reverse ? move.from : move.to;
    const pending = flights.get(to);
    const pose =
      dragPose ||
      (pending?.preview && pending.from === from ? bounds(to) : bounds(from));
    clear();
    slide(from, to, pose);
    if (/^O-O/.test(move.san)) {
      const short = !move.san.startsWith('O-O-O');
      const a = (short ? 'h' : 'a') + from[1],
        b = (short ? 'f' : 'd') + from[1];
      slide(reverse ? b : a, reverse ? a : b);
    }
  }
  function drop(from, to, pose, preview) {
    clear();
    slide(from, to, pose, preview);
  }
  reduced.addEventListener('change', clear);
  window.BoardMotion = { clear, sync, play, drop };
})();
