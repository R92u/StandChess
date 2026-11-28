(() => {
  'use strict';
  const board = document.getElementById('board');
  const texture = new Image();
  const art = new Map();
  let frame = 0,
    canvas,
    cinema,
    concealed,
    sound;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => 1 - (1 - clamp(x)) ** 3;
  function stop() {
    cancelAnimationFrame(frame);
    canvas?.remove();
    cinema?.remove();
    cinema = null;
    canvas = null;
    concealed?.classList.remove('gojo-in-flight');
    concealed = null;
    sound?.pause();
    sound = null;
  }
  function sprite(unit) {
    const key = unit.color + unit.type;
    if (!art.has(key)) {
      const image = new Image();
      image.src = 'assets/mobile/' + key + '.png';
      art.set(key, image);
    }
    return art.get(key);
  }
  function play(event, audio) {
    stop();
    sound = audio;
    const [mode, dest] = event.choice.split(':');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced
      ? 0.38
      : { purple: 10.28, infinity: 1.32, blue: 1.52, red: 1.38 }[mode];
    const layer = (canvas = document.createElement('canvas'));
    layer.className = 'gojo-fx';
    layer.dataset.technique = mode;
    layer.setAttribute('aria-hidden', 'true');
    board.after(layer);
    const rect = board.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5, 780 / rect.width);
    layer.width = Math.max(1, Math.round(rect.width * scale));
    layer.height = Math.max(1, Math.round(rect.height * scale));
    const ctx = layer.getContext('2d');
    if (!ctx) {
      stop();
      return;
    }
    const cols = board.classList.contains('house-board') ? 9 : 8;
    const flipped = board.classList.contains('flipped');
    const tile = layer.width / cols;
    ctx.scale(tile, layer.height / 8);
    let light;
    if (mode === 'purple') {
      cinema = document.createElement('div');
      cinema.className = 'purple-night' + (reduced ? ' quiet' : '');
      cinema.setAttribute('aria-hidden', 'true');
      const view = document.createElement('div');
      view.className = 'purple-stage';
      Object.assign(view.style, {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
      });
      const lit = document.createElement('canvas');
      lit.width = layer.width;
      lit.height = layer.height;
      view.append(lit, layer);
      cinema.append(view);
      document.body.append(cinema);
      light = lit.getContext('2d');
      light?.scale(tile, layer.height / 8);
    }
    function point(sq) {
      const file = sq.charCodeAt(0) - 97;
      return [
        flipped ? cols - file - 0.5 : file + 0.5,
        flipped ? Number(sq[1]) - 0.5 : 8.5 - Number(sq[1]),
      ];
    }
    let [x, y] = point(event.target),
      [endX, endY] = dest ? point(dest) : [x, y];
    if (mode === 'purple') {
      const band = window.StandChess.StandGame.purpleBand(event.target, dest);
      const [adjX, adjY] = point(band[8]);
      const offsetX = (adjX - x) / 2,
        offsetY = (adjY - y) / 2;
      x += offsetX;
      endX += offsetX;
      y += offsetY;
      endY += offsetY;
      ctx.beginPath();
      ctx.rect(
        Math.min(x, endX) - (offsetX ? 1 : 0.5),
        Math.min(y, endY) - (offsetY ? 1 : 0.5),
        offsetX ? 2 : 8,
        offsetY ? 2 : 8,
      );
      ctx.clip();
      if (event.target[1] === '1' && dest[1] === '8') {
        y = flipped ? 0 : 8;
        endY = flipped ? 8 : 0;
      }
    }
    const dx = endX - x,
      dy = endY - y;
    const length = Math.hypot(dx, dy) || 1;
    const fx = dx / length,
      fy = dy / length;
    const victims = (event.victims || []).map((u) => ({
      pos: point(u.square),
      img: sprite(u),
    }));
    const nearby = light
      ? [...board.querySelectorAll('.sq img[src*="assets/mobile/"]')].map(
          (img) => {
            const cell = img.closest('[data-square]');
            const box = img.getBoundingClientRect();
            return {
              img,
              pos: point(cell.dataset.square),
              left: ((box.left - rect.left) * cols) / rect.width,
              top: ((box.top - rect.top) * 8) / rect.height,
              width: (box.width * cols) / rect.width,
              height: (box.height * 8) / rect.height,
            };
          },
        )
      : [];
    const tinted = new Map();
    function litPiece(unit, px, py) {
      const [ux, uy] = unit.pos,
        distance = Math.hypot(ux - px, uy - py);
      if (distance >= 2.85 || !unit.img.naturalWidth) return;
      let sprite = tinted.get(unit.img.src);
      if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = 96;
        const paint = sprite.getContext('2d');
        paint.drawImage(unit.img, 0, 0, 96, 96);
        paint.globalCompositeOperation = 'source-atop';
        paint.fillStyle = 'rgba(204,125,255,.68)';
        paint.fillRect(0, 0, 96, 96);
        tinted.set(unit.img.src, sprite);
      }
      light.globalAlpha = (1 - distance / 2.85) ** 1.2;
      light.drawImage(
        sprite,
        unit.left ?? ux - 0.5,
        unit.top ?? uy - 0.5,
        unit.width ?? 1,
        unit.height ?? 1,
      );
    }
    function illuminate(px, py, travel, released) {
      if (!light) return;
      light.globalAlpha = 1;
      light.clearRect(0, 0, cols, 8);
      const radius = reduced ? 1.4 : 2.85;
      const halo = light.createRadialGradient(px, py, 0, px, py, radius);
      halo.addColorStop(0, 'rgba(213,136,255,.68)');
      halo.addColorStop(0.4, 'rgba(151,62,245,.28)');
      halo.addColorStop(1, 'rgba(91,20,184,0)');
      light.fillStyle = halo;
      light.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      for (const unit of nearby) litPiece(unit, px, py);
      for (const unit of victims) {
        const along = (unit.pos[0] - x) * fx + (unit.pos[1] - y) * fy;
        if (!released || along > length * travel + 0.15) litPiece(unit, px, py);
      }
      light.globalAlpha = 1;
    }
    const moving = event.displaced && sprite(event.displaced);
    if (moving && !reduced) {
      const cell = board.querySelector('[data-square="' + dest + '"]');
      concealed = [...(cell?.querySelectorAll('img') || [])].find(
        (im) => im.src === moving.src,
      );
      concealed?.classList.add('gojo-in-flight');
    }
    if (!texture.src) texture.src = 'assets/effects/gojo-energy.webp';
    const colors = {
      blue: '30,152,255',
      red: '255,39,75',
      purple: '166,62,255',
      infinity: '140,224,255',
    };
    function glow(px, py, r, color, strength = 1) {
      if (r < 0.01) return;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,249,255,' + strength + ')');
      g.addColorStop(0.17, 'rgba(' + color + ',' + strength + ')');
      g.addColorStop(0.54, 'rgba(' + color + ',' + strength * 0.56 + ')');
      g.addColorStop(1, 'rgba(' + color + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
    function orb(px, py, r, row, time) {
      glow(
        px,
        py,
        r * 1.65,
        [colors.blue, colors.red, colors.purple, colors.purple][row],
        0.94,
      );
      if (!texture.naturalWidth) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(
        texture,
        (Math.floor(time * 17) % 16) * 112,
        row * 112,
        112,
        112,
        px - r,
        py - r,
        r * 2,
        r * 2,
      );
      ctx.restore();
    }
    function sparks(px, py, t, radius, color, inward) {
      ctx.lineWidth = 0.022;
      for (let i = 0; i < 24; i++) {
        const a = i * 2.39996;
        let k = (t * 0.95 + i * 0.317) % 1;
        if (inward) k = 1 - k;
        const b = 0.09 + k * radius;
        ctx.strokeStyle =
          'rgba(' + color + ',' + (0.15 + 0.62 * Math.sin(k * Math.PI)) + ')';
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a) * b, py + Math.sin(a) * b);
        ctx.lineTo(
          px + Math.cos(a) * (b + 0.09),
          py + Math.sin(a) * (b + 0.09),
        );
        ctx.stroke();
      }
    }
    function lightning(px, py, t, radius) {
      ctx.lineWidth = 0.034;
      ctx.strokeStyle = '#eec0ff';
      for (let i = 0; i < 8; i++) {
        const a = 2.39996 * i + Math.floor(t * 11) * 0.31;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let j = 1; j <= 6; j++) {
          const wobble = Math.sin(i * 7 + j * 13 + Math.floor(t * 16)) * 0.16;
          ctx.lineTo(
            px + (Math.cos(a + wobble) * radius * j) / 6,
            py + (Math.sin(a + wobble) * radius * j) / 6,
          );
        }
        ctx.stroke();
      }
    }
    const start = performance.now();
    let last = -100;
    function draw(now) {
      if (!canvas || layer !== canvas) return;
      const t = (now - start) / 1000;
      if (t >= duration) {
        stop();
        return;
      }
      frame = requestAnimationFrame(draw);
      if (now - last < 1000 / 36) return;
      last = now;
      ctx.clearRect(0, 0, cols, 8);
      if (reduced) {
        illuminate(x, y, 0, false);
        glow(x, y, 0.65, colors[mode], 0.6);
        if (dest) glow(endX, endY, 0.65, colors[mode], 0.6);
        return;
      }
      if (mode === 'infinity') {
        for (let i = 0; i < 5; i++) {
          const k = (t / duration + i * 0.18) % 1;
          ctx.strokeStyle = 'rgba(172,239,255,' + 0.9 * (1 - k) + ')';
          ctx.lineWidth = 0.026;
          ctx.beginPath();
          ctx.ellipse(
            x,
            y,
            0.32 + k * 0.6,
            0.14 + k * 0.42,
            -0.48,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        sparks(x, y, t, 0.88, colors.infinity, true);
        return;
      }
      if (mode !== 'purple') {
        const blue = mode === 'blue',
          k = ease((t - 0.32) / 0.64);
        const px = x + dx * k,
          py = y + dy * k,
          ax = blue ? endX : x,
          ay = blue ? endY : y;
        if (moving?.naturalWidth)
          ctx.drawImage(moving, px - 0.5, py - 0.5, 1, 1);
        ctx.globalAlpha = clamp((duration - t) / 0.3);
        orb(
          ax,
          ay,
          0.15 + 0.22 * Math.sin((Math.PI * t) / duration),
          blue ? 0 : 1,
          t,
        );
        sparks(ax, ay, t, 1.3, colors[mode], blue);
        ctx.globalAlpha = 1;
        return;
      }
      const travel = ease((t - 9.03) / 0.88),
        px = x + dx * travel,
        py = y + dy * travel;
      illuminate(px, py, travel, t >= 9.03);
      ctx.globalAlpha = clamp((duration - t) / 0.34);
      if (t < 3.15) {
        const gap = 0.72 * (1 - ease((t - 0.58) / 2.55)),
          ax = fy * 0.8 + fx * 0.3,
          ay = -fx * 0.8 + fy * 0.3;
        orb(x + ax * gap, y + ay * gap, 0.31, 0, t);
        orb(x - ax * gap, y - ay * gap, 0.31, 1, t);
        glow(x, y, 0.08 + ease((t - 0.82) / 1.6) * 0.64, colors.purple);
      } else if (t < 4.35) {
        orb(x, y, 0.17 + 0.45 * ease((t - 3.15) / 1.1), 3, t);
        sparks(x, y, t, 1.45, colors.purple, true);
      } else {
        const r = 0.34 + 0.22 * ease((t - 4.35) / 2) + 0.05 * Math.sin(t * 9);
        if (t > 9.03) {
          ctx.lineCap = 'round';
          for (const [width, shade] of [
            [1.9, '#862df72b'],
            [1.15, '#bd43ff7a'],
            [0.42, '#ecd1ffdf'],
          ]) {
            ctx.strokeStyle = shade;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(px, py);
            ctx.stroke();
          }
        }
        orb(px, py, r, 2, t);
        lightning(px, py, t, r * (t > 6.5 ? 2.9 : 2.1));
        sparks(px, py, t, r * 2.7, colors.purple, false);
      }
      ctx.globalAlpha = 1;
    }
    draw(start);
  }
  window.addEventListener('pagehide', stop);
  window.addEventListener('resize', stop);
  window.addEventListener('scroll', stop, { passive: true });
  board.addEventListener('pointerdown', stop);
  window.GojoFX = { play, stop };
})();
