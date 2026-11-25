'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { StandGame, STANDS } = require('./engine');

const rooms = new Map();
const ttl = 24 * 60 * 60 * 1000;
const timer = setInterval(() => {
  for (const [id, room] of rooms)
    if (Date.now() - room.seen > ttl) rooms.delete(id);
}, 60000);
timer.unref();

function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data === undefined ? undefined : JSON.stringify(data));
}
function fail(res, status, error) {
  return reply(res, status, { error });
}
async function readAction(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024) throw new Error('Слишком большой запрос');
  }
  return body ? JSON.parse(body) : {};
}
function roomState(room, side) {
  return {
    side,
    ready: Boolean(room.b),
    version: room.version,
    state: room.game.snapshot(),
  };
}
async function roomApi(req, res, url, id, op) {
  const token = /^Bearer ([0-9a-f]{48})$/.exec(
    req.headers.authorization || '',
  )?.[1];
  if (!token) return fail(res, 401, 'Требуется ключ игрока.');
  if (req.method !== (op ? 'POST' : 'GET'))
    return fail(res, 405, 'Метод не поддерживается.');
  let stand;
  if (op === 'create' || op === 'join') {
    try {
      stand = (await readAction(req)).stand;
    } catch {
      return fail(res, 400, 'Некорректный выбор стенда.');
    }
    if (
      stand !== undefined &&
      (typeof stand !== 'string' || !Object.hasOwn(STANDS, stand))
    )
      return fail(res, 400, 'Неизвестный стенд.');
  }
  let room = rooms.get(id);
  if (!room && op === 'create') {
    if (rooms.size >= 500)
      return fail(res, 503, 'Сервер занят. Попробуйте позже.');
    room = {
      game: new StandGame(undefined, 0, { w: stand || 'crimson' }),
      w: token,
      b: null,
      version: 1,
      seen: Date.now(),
    };
    rooms.set(id, room);
  }
  if (!room) return fail(res, 404, 'Комната закрыта. Создайте новую.');
  if (op === 'join' && !room.b && token !== room.w) {
    room.game = new StandGame(
      undefined,
      0,
      {
        ...room.game.state.stands,
        b: stand || 'world',
      },
      room.game.state.tower,
    );
    room.b = token;
    room.version++;
  }
  const side = token === room.w ? 'w' : token === room.b ? 'b' : null;
  if (!side)
    return fail(
      res,
      403,
      op === 'join'
        ? 'Оба места в комнате заняты.'
        : 'У вас нет места в этой комнате.',
    );
  room.seen = Date.now();
  if (op === 'action') {
    let action;
    try {
      action = await readAction(req);
    } catch {
      return fail(res, 400, 'Некорректное действие.');
    }
    if (!action || typeof action !== 'object')
      return fail(res, 400, 'Некорректное действие.');
    if (
      !room.b ||
      action.version !== room.version ||
      (action.type !== 'merge' && room.game.turn() !== side)
    )
      return fail(res, 409, 'Позиция изменилась. Проверьте, чей сейчас ход.');
    let ok = false;
    if (action.type === 'ability')
      ok = room.game.activate(side, action.target, action.choice);
    if (action.type === 'merge') ok = room.game.merge?.(side);
    if (
      action.type === 'move' &&
      /^(?:[a-h][1-8]|i[345])$/.test(action.from) &&
      /^(?:[a-h][1-8]|i[345])$/.test(action.to) &&
      (action.promotion === undefined ||
        ['q', 'r', 'b', 'n'].includes(action.promotion))
    ) {
      ok = room.game.move(action.from, action.to, action.promotion);
    }
    if (!ok) return fail(res, 422, 'Действие недоступно в этой позиции.');
    room.version++;
  }
  if (!op && url.searchParams.get('since') === String(room.version))
    return reply(res, 204);
  return reply(res, 200, roomState(room, side));
}

const publicFiles = new Set([
  'index.html',
  'style.css',
  'ui.js',
  'online.js',
  'engine.js',
  'variants.js',
  'effects.js',
  'piece-effects.js',
  'board-fx.js',
  'CREDITS.txt',
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
async function serveFile(req, res, pathname) {
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (
    !publicFiles.has(name) &&
    !/^(assets|vendor)\/(?:[\w-]+\/)*[\w.-]+$/.test(name)
  )
    return fail(res, 404, 'Файл не найден.');
  const filename = path.join(__dirname, name);
  const stat = await fs.promises.stat(filename).catch(() => null);
  if (!stat?.isFile()) return fail(res, 404, 'Файл не найден.');
  let start = 0,
    end = stat.size - 1,
    status = 200;
  const headers = {
    'Content-Type': types[path.extname(name)] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (match && (match[1] || match[2])) {
      start = match[1]
        ? Number(match[1])
        : Math.max(0, stat.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
        return res.end();
      }
      status = 206;
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    }
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || stat.size === 0) return res.end();
  const stream = fs.createReadStream(filename, { start, end });
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy()).pipe(res);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return reply(res, 200, { ok: true });
    const route =
      /^\/api\/rooms\/([0-9a-f]{24})(?:\/(create|join|action))?$/.exec(
        url.pathname,
      );
    if (route) return await roomApi(req, res, url, route[1], route[2]);
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return fail(res, 405, 'Метод не поддерживается.');
    return await serveFile(req, res, url.pathname);
  } catch {
    if (!res.headersSent) fail(res, 500, 'Ошибка сервера.');
    else res.destroy();
  }
});
server.requestTimeout = 15000;
server.listen(
  Number(process.env.PORT || 18473),
  process.env.HOST || '0.0.0.0',
  () => console.log('StandChess listening on ' + server.address().port),
);
