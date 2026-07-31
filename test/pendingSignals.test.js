const test = require('node:test');
const assert = require('node:assert/strict');
const pendingSignals = require('../shared/queue/pendingSignals');

test('entrega una señal pendiente una sola vez', async () => {
  const key = 'test:otp';
  const waiting = pendingSignals.waitFor(key, { timeoutMs: 100 });

  assert.equal(pendingSignals.isWaiting(key), true);
  assert.equal(pendingSignals.resolveSignal(key, '123456'), true);
  assert.equal(await waiting, '123456');
  assert.equal(pendingSignals.resolveSignal(key, '654321'), false);
});
