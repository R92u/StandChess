'use strict';
const { gzipSync, gunzipSync } = require('node:zlib');
const config = require('./assets/firebase.json');
const db = 'projects/' + config.projectId + '/databases/(default)/documents';
const endpoint = 'https://firestore.googleapis.com/v1/' + db;
const fail = (status, message) => Object.assign(new Error(message), { status });
class TournamentStore {
  constructor() {
    this.cache = new Map();
    this.session = null;
    this.expires = 0;
  }
  async token() {
    if (Date.now() < this.expires) return this.session;
    if (!process.env.TOURNAMENT_SESSION)
      throw fail(503, 'Турнирный сервер ещё не настроен.');
    const r = await fetch(
      'https://securetoken.googleapis.com/v1/token?key=' + config.apiKey,
      {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: process.env.TOURNAMENT_SESSION,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) throw fail(503, 'Хранилище турнира временно недоступно.');
    const body = await r.json();
    this.session = body.id_token;
    this.expires = Date.now() + (Number(body.expires_in) - 90) * 1000;
    return this.session;
  }
  async call(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + (await this.token()),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
  }
  async read(id) {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < 30000) return hit;
    const res = await this.call(endpoint + '/tournamentData/' + id);
    if (!res.ok && res.status !== 404)
      throw fail(503, 'Не удалось загрузить турнир.');
    const doc = res.ok ? await res.json() : null;
    const entry = {
      id,
      at: Date.now(),
      revision: doc?.updateTime,
      value: doc
        ? JSON.parse(
            gunzipSync(Buffer.from(doc.fields.data.bytesValue, 'base64')),
          )
        : null,
    };
    this.cache.set(id, entry);
    if (this.cache.size > 300)
      this.cache.delete(this.cache.keys().next().value);
    return entry;
  }
  async save(changes) {
    const writes = changes.map(([old, value]) => ({
      update: {
        name: db + '/tournamentData/' + old.id,
        fields: {
          data: {
            bytesValue: gzipSync(JSON.stringify(value)).toString('base64'),
          },
        },
      },
      currentDocument: old.revision
        ? { updateTime: old.revision }
        : { exists: false },
    }));
    let res;
    try {
      res = await this.call(endpoint + ':commit', {
        method: 'POST',
        body: JSON.stringify({ writes }),
      });
    } catch (error) {
      for (const [old] of changes) this.cache.delete(old.id);
      throw error;
    }
    if (!res.ok) {
      for (const [old] of changes) this.cache.delete(old.id);
      const reason = (await res.json()).error?.status;
      if (['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'ABORTED'].includes(reason))
        return false;
      throw fail(503, 'Не удалось сохранить турнир. Попробуйте снова.');
    }
    const { writeResults } = await res.json();
    changes.forEach(([old, value], i) =>
      this.cache.set(old.id, {
        id: old.id,
        at: Date.now(),
        revision: writeResults[i].updateTime,
        value,
      }),
    );
    return true;
  }
}
module.exports = { TournamentStore, fail };
