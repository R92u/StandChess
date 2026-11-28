'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { duelSeat, removeDuel, mobileLogin } = require('./accounts.cjs');
const { StandGame, STANDS } = require('./engine');
const { Tournament, account: tournamentAccount } = require('./tournament.cjs');
const tournament = new Tournament();

const {
  seatVersion,
  rememberDustPosition,
  roomState,
  playAction,
} = require('./room-game.cjs');
const rooms = new Map();
const closedRooms = new Map();
const duelInstance = randomBytes(16).toString('hex');
const ttl = 24 * 60 * 60 * 1000;
const timer = setInterval(() => {
  for (const [id, closedAt] of closedRooms)
    if (Date.now() - closedAt > ttl) closedRooms.delete(id);
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
async function readAction(req, limit = 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('Слишком большой запрос');
  }
  return body ? JSON.parse(body) : {};
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
  if (closedRooms.has(id))
    return fail(res, 410, 'Игрок вышел. Партия завершена.');
  let room = rooms.get(id);
  if (!room && op === 'create') {
    if (rooms.size >= 500)
      return fail(res, 503, 'Сервер занят. Попробуйте позже.');
    room = {
      game: new StandGame(undefined, 0, { w: stand || 'crimson' }),
      w: token,
      b: null,
      version: 1,
      privateUpdates: { w: 0, b: 0 },
      seen: Date.now(),
    };
    rememberDustPosition(room);
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
    rememberDustPosition(room);
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
  if (op === 'leave') {
    rooms.delete(id);
    closedRooms.set(id, Date.now());
    return reply(res, 204);
  }
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
      action.version !== seatVersion(room, side) ||
      (action.type !== 'merge' && room.game.turn() !== side)
    )
      return fail(res, 409, 'Позиция изменилась. Проверьте, чей сейчас ход.');
    const ok = playAction(room, side, action);
    if (!ok) return fail(res, 422, 'Действие недоступно в этой позиции.');
  }
  if (!op && url.searchParams.has('at')) {
    const i = Number(url.searchParams.get('at'));
    if (!Number.isInteger(i) || !room.frames?.[i])
      return fail(res, 400, 'Нет такой позиции');
    return reply(res, 200, roomState(room, side, i));
  }
  if (!op && url.searchParams.get('since') === String(seatVersion(room, side)))
    return reply(res, 204);
  return reply(res, 200, roomState(room, side));
}

const publicFiles = new Set([
  'tournament-ui.js',
  'home.js',
  'social.js',
  'signin.js',
  'signin.html',
  '.well-known/assetlinks.json',
  'index.html',
  'style.css',
  'ui.js',
  'online.js',
  'engine.js',
  'analysis.js',
  'analysis-worker.js',
  'variants.js',
  'effects.js',
  'piece-effects.js',
  'board-fx.js',
  'board-motion.js',
  'gojo-fx.js',
  'CREDITS.txt',
]);
const types = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
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
      /^\/api\/rooms\/([0-9a-f]{24})(?:\/(create|join|action|leave))?$/.exec(
        url.pathname,
      );
    const duel = /^\/api\/duels\/([0-9a-f]{24})(?:\/(enter|action|leave))?$/.exec(
      url.pathname,
    );
    const login = /^\/api\/account\/(transfer|redeem)$/.exec(url.pathname);
    const instance = url.pathname === '/api/duels/instance';
    const cup =
      /^\/api\/tournament(?:\/(register|withdraw|start)|\/games\/(r[1-9]\d*m[1-9]\d*-[1-9]\d*)(?:\/(enter|action|depart|leave))?)?$/.exec(
        url.pathname,
      );
    if (route || duel || login || instance || cup) {
      res.setHeader('Vary', 'Origin');
      if (
        req.headers.origin === 'https://r92u.github.io' ||
        (cup && req.headers.origin === 'https://standchess-r92u.onrender.com')
      ) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
          res.setHeader(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type',
          );
          res.setHeader('Access-Control-Max-Age', '600');
          return reply(res, 204);
        }
      }
      if (cup) {
        const op = cup[1] || cup[3] || (cup[2] ? 'poll' : 'view');
        if (req.method !== (['view', 'poll'].includes(op) ? 'GET' : 'POST'))
          return fail(res, 405, 'Метод не поддерживается.');
        const bearer = /^Bearer (\S+)$/.exec(
          req.headers.authorization || '',
        )?.[1];
        const user =
          op === 'view' && !bearer ? null : await tournamentAccount(bearer);
        let body = {};
        if (req.method === 'POST')
          try {
            body = await readAction(req);
            if (!body || typeof body !== 'object') throw Error();
          } catch {
            return fail(res, 400, 'Некорректное действие.');
          }
        const data = await tournament.handle(
          op,
          cup[2],
          user,
          body,
          url.searchParams,
        );
        return data === null ? reply(res, 204) : reply(res, 200, data);
      }
      if (instance)
        return req.method === 'GET'
          ? reply(res, 200, { instance: duelInstance })
          : fail(res, 405, 'Требуется GET.');
      if (login) {
        if (req.method !== 'POST') return fail(res, 405, 'Требуется POST.');
        let data;
        try {
          data = await readAction(req, 8192);
        } catch {
          return fail(res, 400, 'Некорректный запрос.');
        }
        return reply(res, 200, await mobileLogin(login[1], data));
      }
      if (duel) {
        const id = 'duel:' + duel[1];
        if (closedRooms.has(id))
          return fail(res, 410, 'Игрок вышел. Дуэль завершена.');
        if (!['enter', 'leave'].includes(duel[2]))
          return await roomApi(req, res, url, id, duel[2]);
        if (req.method !== 'POST') return fail(res, 405, 'Требуется POST.');
        const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
        const access = await duelSeat(duel[1], token);
        if (duel[2] === 'leave') {
          await removeDuel(duel[1], token);
          rooms.delete(id);
          closedRooms.set(id, Date.now());
          return reply(res, 204);
        }
        if (closedRooms.has(id))
          return fail(res, 410, 'Игрок вышел. Дуэль завершена.');
        let room = rooms.get(id);
        if (!room) {
          if (
            access.instance !== duelInstance ||
            Date.now() - access.accepted > ttl
          )
            return fail(res, 410, 'Комната закрыта. Отправьте новый вызов.');
          if (rooms.size >= 500)
            return fail(res, 503, 'Сервер занят. Попробуйте позже.');
          room = {
            game: new StandGame(undefined, 0, access.stands),
            w: randomBytes(24).toString('hex'),
            b: randomBytes(24).toString('hex'),
            version: 1,
            privateUpdates: { w: 0, b: 0 },
            seen: Date.now(),
          };
          rememberDustPosition(room);
          rooms.set(id, room);
        }
        room.seen = Date.now();
        return reply(res, 200, {
          ...roomState(room, access.side),
          seat: room[access.side],
        });
      }
      return await roomApi(req, res, url, route[1], route[2]);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return fail(res, 405, 'Метод не поддерживается.');
    return await serveFile(req, res, url.pathname);
  } catch (error) {
    if (!res.headersSent && error.status)
      return fail(res, error.status, error.message);
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
