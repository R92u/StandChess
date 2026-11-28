(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const key = 'standchess.appearance';
  const defaults = { dim: 0, blur: 0, light: '', dark: '' };
  let settings = { ...defaults },
    imageUrl,
    generation = 0,
    database;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    for (const [field, max] of [
      ['dim', 90],
      ['blur', 24],
    ])
      if (Number.isFinite(saved[field]))
        settings[field] = Math.max(0, Math.min(max, saved[field]));
    for (const field of ['light', 'dark'])
      if (/^#[0-9a-f]{6}$/i.test(saved[field])) settings[field] = saved[field];
  } catch {}
  function apply() {
    root.style.setProperty('--scene-dim', settings.dim / 100);
    root.style.setProperty('--scene-blur', settings.blur + 'px');
    root.classList.toggle(
      'custom-scene',
      Boolean(imageUrl || settings.blur || settings.dim),
    );
    for (const field of ['dim', 'blur']) {
      $('theme-' + field).value = settings[field];
      $('theme-' + field + '-value').textContent =
        settings[field] + (field === 'dim' ? '%' : ' px');
    }
    for (const field of ['light', 'dark']) {
      const color = settings[field];
      $('theme-' + field).value =
        color || (field === 'light' ? '#afcfdb' : '#315c80');
      root.classList.toggle('custom-' + field, !!color);
      if (color) {
        root.style.setProperty('--tile-' + field, color);
        const [r, g, b] = color
          .slice(1)
          .match(/../g)
          .map((v) => parseInt(v, 16));
        root.style.setProperty(
          '--coord-' + field,
          r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#173449' : '#ebf3f8',
        );
      } else {
        root.style.removeProperty('--tile-' + field);
        root.style.removeProperty('--coord-' + field);
      }
    }
    $('theme-remove').hidden = !(imageUrl || settings.dim || settings.blur);
    $('theme-board-reset').hidden = !(settings.dark || settings.light);
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      $('theme-status').textContent =
        'Настройки применены до закрытия страницы.';
    }
  }
  for (const field of Object.keys(defaults)) {
    const control = $('theme-' + field);
    control.oninput = () => {
      settings[field] =
        control.type === 'range' ? control.valueAsNumber : control.value;
      apply();
      save();
    };
  }
  $('theme-board-reset').onclick = () => {
    settings.light = settings.dark = '';
    apply();
    save();
  };
  function db() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open('standchess-appearance', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('images');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((e) => {
        database = null;
        throw e;
      });
    return database;
  }
  async function photo(operation, blob) {
    const conn = await db();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(
        'images',
        operation === 'get' ? 'readonly' : 'readwrite',
      );
      const store = tx.objectStore('images');
      const req =
        operation === 'put'
          ? store.put(blob, 'background')
          : store[operation]('background');
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(tx.error);
    });
  }
  function display(blob) {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = blob && URL.createObjectURL(blob);
    if (imageUrl)
      root.style.setProperty('--scene-image', 'url("' + imageUrl + '")');
    else root.style.removeProperty('--scene-image');
    apply();
  }
  $('theme-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const seq = ++generation,
      source = URL.createObjectURL(file);
    $('theme-status').textContent = 'Открываем изображение…';
    try {
      const img = new Image();
      img.src = source;
      await img.decode();
      const scale = Math.min(
        1,
        2048 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.88),
      );
      if (!blob) throw Error();
      if (seq !== generation) return;
      display(blob);
      try {
        await photo('put', blob);
        if (seq === generation)
          $('theme-status').textContent = 'Фон сохранён на этом устройстве.';
      } catch {
        if (seq === generation)
          $('theme-status').textContent =
            'Фон применён. Для сохранения требуется место в хранилище.';
      }
    } catch {
      if (seq === generation)
        $('theme-status').textContent =
          'Не удалось открыть изображение. Попробуйте другой файл.';
    } finally {
      URL.revokeObjectURL(source);
    }
  };
  $('theme-remove').onclick = async () => {
    const seq = ++generation;
    settings.dim = settings.blur = 0;
    display(null);
    save();
    try {
      await photo('delete');
      if (seq === generation) $('theme-status').textContent = '';
    } catch {
      if (seq === generation)
        $('theme-status').textContent = 'Не удалось сохранить сброс фона.';
    }
  };
  apply();
  photo('get')
    .then((blob) => {
      if (!generation && blob) display(blob);
    })
    .catch(() => {});
})();
