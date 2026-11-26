'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

test('secret arming is absent from opponent snapshots, polling and replay for either seat', async (t) => {
  const server = spawn(
    process.execPath,
    [path.join(__dirname, '../server.js')],
    {
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
      windowsHide: true,
    },
  );
  t.after(() => server.kill());
  const [line] = await once(server.stdout, 'data');
  const port = line.toString().match(/listening on (\d+)/)[1];
  const url = 'http://127.0.0.1:' + port + '/api/rooms/' + 'a'.repeat(24);
  function request(side, suffix = '', body) {
    return fetch(url + suffix, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + (side === 'w' ? '1' : '2').repeat(48),
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
    });
  }
  async function read(side, suffix = '', body) {
    const response = await request(side, suffix, body);
    assert.equal(response.status, 200);
    return response.json();
  }
  async function act(side, action) {
    const { version } = await read(side);
    return read(side, '/action', { ...action, version });
  }
  await read('w', '/create', { stand: 'dust' });
  await read('b', '/join', { stand: 'dust' });
  const lineOfPlay =
    'f2f3 e7e5 e2e3 a7a6 g2g4 b7b6 a2a3 c7c6 b2b3 d7d6 c2c3 g7g6 d2d3 h7h6 h2h3 c8b7 a1a2 a8a7 h1h2 h8h7'.split(
      ' ',
    );
  for (const [i, move] of lineOfPlay.entries())
    await act(i % 2 ? 'b' : 'w', {
      type: 'move',
      from: move.slice(0, 2),
      to: move.slice(2),
    });
  for (const [side, foe, target, from, to] of [
    ['w', 'b', 'f3', 'f3', 'f4'],
    ['b', 'w', 'g6', 'e5', 'f4'],
  ]) {
    const before = await read(foe),
      index = before.state.events.length;
    const history = await read(foe, '?at=' + index);
    const armed = await act(side, { type: 'ability', target });
    assert.equal(armed.state.mana[side], 0);
    assert.equal(armed.state.position.units[target].dust, 3);
    assert.deepEqual(await read(foe), before);
    assert.deepEqual(await read(foe, '?at=' + index), history);
    assert.equal((await request(foe, '?at=' + (index + 1))).status, 400);
    assert.equal((await request(foe, '?since=' + before.version)).status, 204);
    await act(side, { type: 'move', from, to });
    const after = await read(foe);
    assert.equal(after.version, before.version + 1);
    assert.equal(after.state.events.length, index + 1);
    assert.equal(after.state.mana[side], undefined);
    assert.equal(after.state.lastMove.manaEarned, undefined);
    assert.equal(after.state.lastMove.event, index);
    assert.ok(!after.state.events.some((e) => e.stand === 'dust'));
    if (side === 'b')
      assert.equal(after.state.events.at(-1).detonation.square, 'f4');
  }
});
