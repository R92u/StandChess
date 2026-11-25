(() => {
  'use strict';
  const el = (id) => document.getElementById(id);
  const overlay = el('ability-fx');
  const lens = el('world-lens');
  const films = {
    w: el('skip-film'),
    b: el('stop-film'),
    resume: el('resume-film'),
  };
  const hasVideoClock = typeof films.b.requestVideoFrameCallback === 'function';
  const optics = el('world-optics');
  const field = el('wave-map');
  const bend = el('wave-bend');
  const channels = Array.from(
    optics.querySelector('feComponentTransfer').children,
  );
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v) => Math.min(1, Math.max(0, v));
  let current = null,
    frame = 0,
    generation = 0,
    mapReady = false;
  let lastTime = -1,
    lateFrames = 0,
    lightOptics = false;
  let viewportWidth = 0,
    viewportHeight = 0;

  // Eight luminance control points per channel. Highlights cross through the
  // shadows during the negative, then come back as the sphere contracts.
  const palette = {
    violet: [
      [7, 3, 19],
      [35, 14, 62],
      [104, 49, 129],
      [195, 169, 224],
      [230, 238, 255],
      [131, 118, 181],
      [53, 29, 90],
      [222, 219, 252],
    ],
    acid: [
      [4, 5, 13],
      [49, 16, 78],
      [110, 44, 152],
      [203, 189, 219],
      [223, 246, 141],
      [146, 193, 64],
      [31, 61, 27],
      [238, 240, 203],
    ],
    gold: [
      [9, 9, 27],
      [33, 27, 68],
      [74, 79, 142],
      [124, 176, 209],
      [234, 227, 164],
      [252, 226, 93],
      [100, 81, 32],
      [249, 238, 194],
    ],
  };
  const identity = Array.from({ length: 8 }, (_, i) =>
    Array(3).fill((i * 255) / 7),
  );
  let lastFrom, lastTo, lastMix;
  function setPalette(from, to, fraction) {
    const k = clamp(fraction);
    if (from === lastFrom && to === lastTo && k === lastMix) return;
    lastFrom = from;
    lastTo = to;
    lastMix = k;
    channels.forEach((channel, c) => {
      const row = from.map((p, i) =>
        ((p[c] + (to[i][c] - p[c]) * k) / 255).toFixed(3),
      );
      const values = row.join(' ');
      if (channel.getAttribute('tableValues') !== values)
        channel.setAttribute('tableValues', values);
    });
  }
  // Generate the vector map locally so SVG filter images also work offline
  // under file://. Mid-grey is zero displacement in both channels.
  function prepareMap() {
    if (!mapReady) {
      const map = document.createElement('canvas');
      const n = 160;
      map.width = map.height = n;
      const ctx = map.getContext('2d');
      const pixels = ctx.createImageData(n, n);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const nx = (2 * x) / (n - 1) - 1,
            ny = (2 * y) / (n - 1) - 1,
            r = Math.hypot(nx, ny);
          const edge = Math.exp(-((r - 0.82) ** 2) / 0.011),
            inside = Math.max(0, 1 - r * r);
          const radial = 0.72 * edge - 0.27 * inside;
          const twist =
            0.36 * inside * Math.sin(4 * r) +
            0.055 * edge * Math.sin(5 * Math.atan2(ny, nx));
          const i = (y * n + x) * 4;
          pixels.data[i] = r < 1 ? 128 + 127 * (radial * nx - twist * ny) : 128;
          pixels.data[i + 1] =
            r < 1 ? 128 + 127 * (radial * ny + twist * nx) : 128;
          pixels.data[i + 2] = 128;
          pixels.data[i + 3] = 255;
        }
      ctx.putImageData(pixels, 0, 0);
      field.setAttribute('href', map.toDataURL('image/png'));
      mapReady = true;
    }
  }
  // Prime the same viewport-sized render target used by the first wave.
  // A thumbnail would allocate a new full-size target during playback.
  function primeOptics() {
    if (current || reduced.matches || document.hidden) return;
    prepareMap();
    viewportWidth = innerWidth;
    viewportHeight = innerHeight;
    optics.setAttribute('width', viewportWidth);
    optics.setAttribute('height', viewportHeight);
    lens.style.clipPath = positionSphere(0.45, 0.4);
    setPalette(identity, palette.violet, 0.25);
    lens.classList.add('priming');
    lens.hidden = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!lens.classList.contains('priming')) return;
        lens.hidden = true;
        lens.classList.remove('priming');
        lens.removeAttribute('style');
      }),
    );
  }
  if ('requestIdleCallback' in window)
    window.requestIdleCallback(primeOptics, { timeout: 900 });
  else setTimeout(primeOptics, 0);

  // Radius samples from the two filmed fronts. Units are fractions of frame
  // width, and timestamps are relative to the linked 00:09.000 frame.
  const expansion = [
    [1.933, 0.08],
    [1.95, 0.14],
    [1.967, 0.26],
    [1.983, 0.34],
    [2, 0.412],
    [2.05, 0.477],
    [2.09, 0.528],
    [2.15, 0.7],
  ];
  const echo = [
    [2.115, 0.065],
    [2.167, 0.16],
    [2.233, 0.355],
    [2.27, 0.48],
    [2.34, 0.71],
  ];
  const contraction = [
    [2.905, 0.61],
    [2.955, 0.51],
    [3.015, 0.455],
    [3.083, 0.388],
    [3.133, 0.346],
  ];
  function sample(keys, t) {
    for (let i = 1; i < keys.length; i++) {
      const [time, value] = keys[i];
      if (t <= time) {
        const [a, v] = keys[i - 1];
        return v + (value - v) * clamp((t - a) / (time - a));
      }
    }
    return keys[keys.length - 1][1];
  }
  function positionSphere(radius, power) {
    // Match the light matte's 800:422 frame even on a portrait viewport.
    const x = viewportWidth * 0.505,
      y = viewportHeight * 0.395;
    const rx = viewportWidth * radius,
      ry = viewportHeight * (800 / 422) * radius;
    field.setAttribute('x', x - rx);
    field.setAttribute('y', y - ry);
    field.setAttribute('width', 2 * rx);
    field.setAttribute('height', 2 * ry);
    bend.setAttribute('scale', Math.min(rx, ry) * power);
    return 'ellipse(' + rx + 'px ' + ry + 'px at ' + x + 'px ' + y + 'px)';
  }
  function renderWorld(t) {
    if (t < 1.933) {
      lens.style.clipPath = 'none';
      const warm = clamp((t - 0.06) / 1.7);
      lens.style.backdropFilter =
        'sepia(.78) saturate(1.8) contrast(1.08) brightness(1.12)';
      lens.style.opacity = String(warm * 0.48);
      return;
    }
    if (t < 3.133) {
      if (lightOptics) {
        // Keep the recorded 60 fps wave and sound when a device misses several
        // presentation deadlines. Native colour filters avoid the displacement pass.
        lens.style.clipPath = 'none';
        lens.style.opacity = '0.9';
        lens.style.backdropFilter =
          t < 2.58
            ? 'invert(.85) sepia(.65) saturate(2.3) hue-rotate(224deg)'
            : t < 2.77
              ? 'invert(.8) sepia(.82) saturate(2.5) hue-rotate(50deg)'
              : 'invert(.8) sepia(.9) saturate(2.2) hue-rotate(350deg)';
        return;
      }
      if (!mapReady) prepareMap();
      lens.style.backdropFilter = 'url("#world-optics")';
      lens.style.opacity = '1';
      if (t >= 2.15) lens.style.clipPath = 'none';
      if (t < 2.15) {
        lens.style.clipPath = positionSphere(sample(expansion, t), 0.44);
        setPalette(identity, palette.violet, clamp((t - 1.933) / 0.13));
      } else if (t < 2.58) {
        if (t < 2.48)
          positionSphere(sample(echo, t), 0.34 * clamp((2.48 - t) / 0.16));
        else bend.setAttribute('scale', '0');
        setPalette(palette.violet, palette.violet, 0);
      } else if (t < 2.905) {
        bend.setAttribute('scale', '0');
        if (t < 2.76)
          setPalette(palette.violet, palette.acid, (t - 2.58) / 0.12);
        else setPalette(palette.acid, palette.gold, (t - 2.76) / 0.1);
      } else {
        positionSphere(sample(contraction, t), -0.52);
        setPalette(palette.gold, palette.gold, 0);
      }
      return;
    }
    // The cut to the city is a cyan exposure bloom followed by cool, still
    // colour. Keep the live board readable while the audio tail decays.
    lens.style.clipPath = 'none';
    lens.style.backdropFilter =
      'saturate(.48) sepia(.36) hue-rotate(146deg) contrast(.96)';
    lens.style.opacity = String(clamp((5.9 - t) / 0.65) * 0.9);
  }
  function stop() {
    window.PieceEffects?.stop();
    window.BoardStandFX?.stop();
    generation++;
    cancelTick();
    if (current) {
      current.pause();
      if (current.readyState > 0) current.currentTime = 0;
    }
    current = null;
    overlay.hidden = true;
    overlay.className = '';
    lens.hidden = true;
    lens.classList.remove('priming');
    lens.removeAttribute('style');
    delete document.body.dataset.standVisual;
  }
  function cancelTick() {
    if (hasVideoClock) films.b.cancelVideoFrameCallback(frame);
    else cancelAnimationFrame(frame);
    frame = 0;
  }
  function present() {
    if (!current) return;
    const world = current === films.b;
    overlay.className =
      (world
        ? 'fx-world'
        : current === films.resume
          ? 'fx-resume'
          : 'fx-crimson') + (reduced.matches ? ' reduced' : '');
    cancelTick();
    lens.hidden = !world || reduced.matches;
    if (world && !reduced.matches) {
      viewportWidth = innerWidth;
      viewportHeight = innerHeight;
      optics.setAttribute('width', viewportWidth);
      optics.setAttribute('height', viewportHeight);
      renderWorld(current.currentTime);
      scheduleTick();
    }
  }
  function scheduleTick() {
    frame = hasVideoClock
      ? films.b.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  }
  function tick(_now, metadata) {
    if (current !== films.b || reduced.matches) return;
    const t = metadata
      ? metadata.mediaTime
      : Math.floor(current.currentTime * 60) / 60;
    if (t !== lastTime) {
      if (t > 1.93 && t < 3.14 && lastTime >= 1.9 && !current.seeking) {
        const gap = t - lastTime;
        if (gap > 0.042 && gap < 0.25) lateFrames++;
        if (lateFrames >= 2) lightOptics = true;
      }
      renderWorld(t);
      lastTime = t;
    }
    scheduleTick();
  }
  function play(color, sound) {
    stop();
    const media = films[color],
      token = generation;
    current = media;
    media.muted = !sound;
    media.volume = 0.62;
    document.body.dataset.standVisual =
      color === 'w' ? 'crimson' : color === 'b' ? 'world' : 'resume';
    overlay.hidden = false;
    lastTime = -1;
    lateFrames = 0;
    lightOptics = false;
    present();
    media.play().catch(async (error) => {
      if (generation !== token || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError' && !media.muted) {
        media.muted = true;
        try {
          await media.play();
          return;
        } catch {}
      }
      if (generation === token) stop();
    });
  }
  for (const film of Object.values(films)) {
    film.addEventListener('ended', () => {
      if (current === film && film.ended) stop();
    });
    film.addEventListener('error', () => {
      if (current === film) stop();
    });
  }
  reduced.addEventListener('change', present);
  window.addEventListener('resize', present);
  window.addEventListener('pagehide', stop);
  window.StandEffects = {
    play,
    stop,
    setSound(enabled) {
      if (current) current.muted = !enabled;
    },
  };
})();
