'use strict';
const { randomBytes } = require('node:crypto');
const config = require('./assets/firebase.json');
const ident = 'https://identitytoolkit.googleapis.com/v1/accounts:';
const store =
  'https://firestore.googleapis.com/v1/projects/' +
  config.projectId +
  '/databases/(default)/documents/duels/';
const codes = new Map();
const timeout = () => AbortSignal.timeout(9000);
const err = (status, message) => Object.assign(new Error(message), { status });
async function identity(method, body) {
  const res = await fetch(ident + method + '?key=' + config.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeout(),
  });
  if (!res.ok)
    throw err(
      res.status >= 500 ? 503 : 401,
      'Не удалось подтвердить аккаунт Google.',
    );
  return res.json();
}
async function duelSeat(id, token) {
  if (!token || token.length > 8192) throw err(401, 'Войдите через Google.');
  const [account, record] = await Promise.all([
    identity('lookup', { idToken: token }),
    fetch(store + id, {
      headers: { Authorization: 'Bearer ' + token },
      signal: timeout(),
    }),
  ]);
  if (!record.ok)
    throw err(record.status >= 500 ? 503 : 403, 'Приглашение недоступно.');
  const { fields } = await record.json();
  const uid = account.users?.[0]?.localId;
  const side =
    uid &&
    (fields.from?.stringValue === uid
      ? 'w'
      : fields.to?.stringValue === uid
        ? 'b'
        : null);
  if (!side || fields.status?.stringValue !== 'accepted')
    throw err(403, 'Для начала дуэли нужно принять приглашение.');
  return {
    side,
    stands: {
      w: fields.hostStand.stringValue,
      b: fields.guestStand.stringValue,
    },
    accepted: Date.parse(fields.accepted.timestampValue),
    instance: fields.instance?.stringValue,
  };
}
async function mobileLogin(op, data) {
  const now = Date.now();
  for (const [key, entry] of codes) if (entry.expires <= now) codes.delete(key);
  if (op === 'redeem') {
    const code = data?.code;
    const entry = typeof code === 'string' && codes.get(code);
    if (!entry) throw err(400, 'Код истёк или введён неверно.');
    codes.delete(code);
    return { googleToken: entry.googleToken };
  }
  const googleToken = data?.googleToken;
  if (
    typeof googleToken !== 'string' ||
    googleToken.length > 7000 ||
    googleToken.split('.').length !== 3
  )
    throw err(400, 'Не удалось получить подтверждение от Google.');
  if (codes.size >= 300) throw err(503, 'Повторите вход через две минуты.');
  const account = await identity('signInWithIdp', {
    postBody: new URLSearchParams({
      id_token: googleToken,
      providerId: 'google.com',
    }).toString(),
    requestUri: 'https://standchess-r92u.onrender.com/signin.html',
    returnSecureToken: false,
  });
  if (
    !account.localId ||
    account.needConfirmation ||
    account.providerId !== 'google.com'
  )
    throw err(401, 'Google не подтвердил вход.');
  const code = randomBytes(16).toString('hex').toUpperCase();
  const entry = { googleToken, expires: Date.now() + 120000 };
  codes.set(code, entry);
  setTimeout(() => codes.delete(code), 120000).unref();
  return { code };
}
module.exports = { duelSeat, mobileLogin, identity };
