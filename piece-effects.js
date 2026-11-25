(() => {
  'use strict';
  const board = document.getElementById('board');
  const canvas = document.getElementById('piece-fx');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const span = 400,
    tau = Math.PI * 2;
  let active = null,
    frame = 0;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const fade = (t, start, end) => clamp((t - start) / (end - start));
  function noise(n) {
    const v = Math.sin(n * 78.233 + 0.5) * 43758.5453;
    return v - Math.floor(v);
  }
  function line(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function ring(x, y, rx, ry, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, tau);
    ctx.stroke();
  }
  function sprite(stamp, sx = 1, sy = 1, dx = 0, dy = 0) {
    // Keep the lower edge against the square as the piece buckles.
    ctx.drawImage(stamp, dx - 45 * sx, dy + 45 - 90 * sy, 90 * sx, 90 * sy);
  }
  function pressure(t, stamp) {
    const impact = fade(t, 0.31, 0.4),
      settle = fade(t, 0.42, 0.73);
    const tremor = (1 - impact) * fade(t, 0, 0.08) * Math.sin(t * 210) * 1.6;
    const press = impact * (1 - 0.28 * settle);
    const wake = fade(t, 0.03, 0.24) * (1 - fade(t, 0.63, 0.96));
    ctx.save();
    ctx.globalAlpha = wake;
    for (let i = 0; i < 23; i++) {
      const x = (noise(i + 2) - 0.5) * 109,
        y = -135 + ((t * 240 + noise(i + 5) * 115) % 118);
      line(
        x,
        y,
        x * 0.95,
        y + 14 + noise(i + 23) * 33,
        i % 3 ? '#c2fa72' : '#234633',
        i % 3 ? 1 : 2.1,
      );
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(20,43,31,' + (0.16 + 0.3 * impact) + ')';
    ctx.beginPath();
    ctx.ellipse(0, 38, 20 + 14 * press, 3 + 3 * press, 0, 0, tau);
    ctx.fill();
    sprite(
      stamp,
      1 + 0.16 * press,
      1 - 0.52 * press,
      tremor,
      -4 * Math.sin(Math.PI * fade(t, 0.19, 0.31)) * (1 - impact),
    );
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const p = fade(t, 0.36 + i * 0.082, 0.61 + i * 0.09);
      if (p > 0 && p < 1)
        ring(
          0,
          35,
          18 + 58 * p,
          3 + 12 * p,
          'rgba(202,255,132,' + (1 - p) * 0.95 + ')',
          2.4 * (1 - p) + 0.4,
        );
    }
    const cracks = fade(t, 0.36, 0.43) * (1 - fade(t, 0.73, 0.98));
    if (cracks > 0) {
      ctx.save();
      ctx.globalAlpha = cracks;
      for (let i = 0; i < 9; i++) {
        const angle = (tau * i) / 9 + 0.2;
        const x = Math.cos(angle),
          y = Math.sin(angle) * 0.34;
        line(x * 14, 36 + y * 14, x * 29 + 3, 36 + y * 25, '#263833', 1.6);
        line(
          x * 29 + 3,
          36 + y * 25,
          x * (40 + noise(i) * 14),
          36 + y * 42,
          '#354438',
          1,
        );
      }
      ctx.restore();
    }
  }

  // Irregular triangles share vertices, so their pixels reconstruct the same sprite.
  const mesh = [];
  const vertices = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => [
      -45 + x * 22.5 + (x === 0 || x === 4 ? 0 : (noise(y * 5 + x) - 0.5) * 13),
      -45 +
        y * 22.5 +
        (y === 0 || y === 4 ? 0 : (noise(50 + y * 5 + x) - 0.5) * 13),
    ]),
  );
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const a = vertices[y][x],
        b = vertices[y][x + 1],
        c = vertices[y + 1][x + 1],
        d = vertices[y + 1][x];
      mesh.push(
        ...((x + y) % 2
          ? [
              [a, b, d],
              [b, c, d],
            ]
          : [
              [a, b, c],
              [a, c, d],
            ]),
      );
    }
  function reconstruct(t, stamp) {
    for (const [i, points] of mesh.entries()) {
      const progress = fade(
        t,
        0.025 + noise(i + 1) * 0.14,
        0.68 + noise(i + 2) * 0.14,
      );
      const remaining = (1 - progress) ** 1.7;
      const cx = (points[0][0] + points[1][0] + points[2][0]) / 3;
      const cy = (points[0][1] + points[1][1] + points[2][1]) / 3;
      const angle = Math.atan2(cy, cx) + (noise(i + 16) - 0.5) * 1.35;
      const reach = 62 + noise(i + 20) * 64;
      const dx = Math.cos(angle + remaining * 0.55) * reach * remaining,
        dy = Math.sin(angle + remaining * 0.55) * reach * remaining;
      ctx.save();
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate((noise(i + 6) - 0.5) * 4.2 * remaining);
      ctx.translate(-cx, -cy);
      ctx.beginPath();
      ctx.moveTo(...points[0]);
      ctx.lineTo(...points[1]);
      ctx.lineTo(...points[2]);
      ctx.closePath();
      ctx.clip();
      sprite(stamp);
      if (remaining > 0.015) {
        // Tint only the opaque pixels of this shard, using the cached silhouette.
        ctx.globalAlpha = Math.min(0.68, remaining + 0.08);
        sprite(i % 3 ? active.aqua : active.rose);
      }
      ctx.restore();
    }
    const sealed = fade(t, 0.73, 0.84);
    if (sealed) {
      ctx.save();
      ctx.globalAlpha = sealed;
      sprite(stamp);
      ctx.restore();
    }
    const light = fade(t, 0.63, 0.77) * (1 - fade(t, 0.79, 0.97));
    if (light > 0) {
      ctx.save();
      ctx.globalAlpha = light * 0.68;
      sprite(active.aqua);
      ctx.restore();
      ring(
        0,
        14,
        22 + fade(t, 0.73, 0.98) * 34,
        8 + fade(t, 0.73, 0.98) * 9,
        'rgba(178,251,255,' + light + ')',
        1.9,
      );
    }
    for (let i = 0; i < 9; i++) {
      const p = fade(t, 0.12 + noise(i + 30) * 0.5, 0.8 + noise(i) * 0.13);
      if (p <= 0 || p >= 1) continue;
      const angle = (i * tau) / 9,
        radius = 16 + (1 - p) * 80;
      const x = Math.cos(angle) * radius,
        y = Math.sin(angle) * radius;
      const size = Math.sin(p * Math.PI) * 4;
      line(x - size, y, x + size, y, '#ecffff', 0.9);
      line(x, y - size * 1.7, x, y + size * 1.7, '#acf0ff', 1.3);
    }
  }
  function tint(stamp, color) {
    const out = document.createElement('canvas');
    out.width = out.height = stamp.width;
    const c = out.getContext('2d');
    c.drawImage(stamp, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, out.width, out.height);
    return out;
  }
  function stop() {
    cancelAnimationFrame(frame);
    board
      .querySelector('.fx-piece-hidden')
      ?.classList.remove('fx-piece-hidden');
    canvas.hidden = true;
    delete canvas.dataset.effect;
    active = null;
  }
  function sync() {
    if (!active) return;
    const cell = board.querySelector('[data-square="' + active.square + '"]');
    const img = cell?.querySelector('img:not(.revive-ghost)');
    if (!img || img.getAttribute('src') !== active.src) {
      stop();
      return;
    }
    cell.classList.add('fx-piece-hidden');
    const index = Array.prototype.indexOf.call(board.children, cell);
    canvas.style.left = ((index % 8) + 0.5) * 12.5 + '%';
    canvas.style.top = (Math.floor(index / 8) + 0.5) * 12.5 + '%';
  }
  function draw(now) {
    if (!active) return;
    const { id, stamp, start, duration } = active,
      t = clamp((now - start) / duration);
    ctx.setTransform(
      canvas.width / span,
      0,
      0,
      canvas.height / span,
      canvas.width / 2,
      canvas.height / 2,
    );
    ctx.clearRect(-span / 2, -span / 2, span, span);
    if (t >= 1) {
      stop();
      return;
    }
    if (reduced.matches) {
      sprite(stamp, 1, id === 'echoes' ? 0.68 : 1);
    } else if (id === 'echoes') pressure(t, stamp);
    else reconstruct(t, stamp);
    frame = requestAnimationFrame(draw);
  }
  async function play(id, square) {
    stop();
    const cell = board.querySelector('[data-square="' + square + '"]');
    const img = cell?.querySelector('img:not(.revive-ghost)');
    if (!img || !ctx) return;
    const token = { id, square, src: img.getAttribute('src') };
    active = token;
    if (!img.complete || !img.naturalWidth) {
      try {
        await img.decode();
      } catch {
        if (active === token) stop();
        return;
      }
    }
    if (active !== token) return;
    const pixels = Math.max(
      48,
      Math.min(
        256,
        Math.ceil(cell.clientWidth * Math.min(window.devicePixelRatio || 1, 2)),
      ),
    );
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = pixels;
    stamp.getContext('2d').drawImage(img, 0, 0, pixels, pixels);
    Object.assign(token, {
      stamp,
      start: performance.now(),
      duration: reduced.matches ? 320 : id === 'echoes' ? 2120 : 1390,
    });
    if (id === 'diamond') {
      token.aqua = tint(stamp, '#aefaff');
      token.rose = tint(stamp, '#ffc4e9');
    }
    canvas.width = canvas.height = pixels * 4;
    canvas.dataset.effect = id;
    canvas.hidden = false;
    sync();
    draw(token.start);
  }
  window.addEventListener('pagehide', stop);
  reduced.addEventListener('change', stop);
  window.PieceEffects = { play, stop, sync };
})();
