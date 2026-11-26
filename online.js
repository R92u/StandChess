'use strict';
// The invitation names the room. The private seat key stays in the player's browser.
window.StandRoom = class StandRoom {
  constructor(onState, onConnection) {
    this.onState = onState;
    this.onConnection = onConnection;
    this.reset();
  }
  reset() {
    clearTimeout(this.timer);
    this.id = this.side = this.key = null;
    this.version = -1;
    this.connected = this.ready = this.busy = false;
  }
  random(bytes) {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  }
  saved(id) {
    try {
      return localStorage.getItem('stand-chess.seat.' + id);
    } catch {
      return null;
    }
  }
  async request(id, key, op, body, since, at) {
    const url =
      '/api/rooms/' +
      id +
      (op ? '/' + op : '') +
      (at !== undefined
        ? '?at=' + at
        : since === undefined
          ? ''
          : '?since=' + since);
    const headers = { Authorization: 'Bearer ' + key };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, {
      method: op ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.state) {
      const e = new Error(data.error || 'Сервер комнат недоступен.');
      e.status = response.status;
      throw e;
    }
    return data;
  }
  async enter(id, op, stand) {
    const key = this.saved(id) || this.random(24);
    try {
      localStorage.setItem('stand-chess.seat.' + id, key);
    } catch {}
    const data = await this.request(id, key, op, op ? { stand } : undefined);
    this.reset();
    this.id = id;
    this.key = key;
    this.apply(data, true);
    this.schedule();
  }
  apply(data, first = false) {
    const reconnect = !this.connected;
    this.connected = true;
    if (data && data.version > this.version) {
      this.version = data.version;
      this.ready = data.ready;
      this.side = data.side;
      this.onState(data, first);
    } else if (reconnect) this.onConnection();
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.id)
      this.timer = setTimeout(() => this.poll(), this.connected ? 950 : 2400);
  }
  async poll() {
    const { id, key } = this;
    if (!id) return;
    try {
      const data = await this.request(id, key, '', null, this.version);
      if (this.id === id) this.apply(data);
    } catch (e) {
      if (this.id !== id) return;
      if (e.status === 404 || e.status === 403) {
        this.reset();
        this.onConnection(e.message);
        return;
      }
      if (this.connected) {
        this.connected = false;
        this.onConnection();
      }
    } finally {
      if (this.id === id) this.schedule();
    }
  }
  async act(action) {
    const { id, key, version } = this;
    if (!id || !this.connected || !this.ready || this.busy) return;
    this.busy = true;
    this.onConnection();
    try {
      const data = await this.request(id, key, 'action', {
        ...action,
        version,
      });
      if (this.id !== id) return false;
      this.apply(data);
      return true;
    } catch (e) {
      if (this.id === id) {
        await this.poll();
        throw e;
      }
    } finally {
      if (this.id === id) {
        this.busy = false;
        this.onConnection();
      }
    }
  }
};
