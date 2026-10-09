import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createChunkedStore, type KeyValueBackend } from '../src/services/chunked-store.ts';

function memoryBackend(limit = 2048) {
  const data = new Map<string, string>();
  let failNextSetOf: string | null = null;
  const backend: KeyValueBackend = {
    async get(key) { return data.get(key) ?? null; },
    async set(key, value) {
      if (failNextSetOf && key.endsWith(failNextSetOf)) { failNextSetOf = null; throw new Error('write interrupted'); }
      assert.ok(value.length <= limit, `value for ${key} is over the ${limit} character limit`);
      data.set(key, value);
    },
    async remove(key) { data.delete(key); },
  };
  return { backend, data, failOn: (suffix: string) => { failNextSetOf = suffix; } };
}

const session = (size: number, mark = 'x') => JSON.stringify({ token: mark.repeat(size) });

test('a long value is stored in entries under the size limit and read back intact', async () => {
  const { backend, data } = memoryBackend();
  const store = createChunkedStore(backend);
  const value = session(7000);
  await store.set('auth', value);
  assert.equal(await store.get('auth'), value);
  assert.ok(data.size >= 5);
});

test('a short value and an empty value both round-trip', async () => {
  const store = createChunkedStore(memoryBackend().backend);
  await store.set('auth', 'short');
  assert.equal(await store.get('auth'), 'short');
  await store.set('auth', '');
  assert.equal(await store.get('auth'), '');
});

test('nothing stored reads as null', async () => {
  assert.equal(await createChunkedStore(memoryBackend().backend).get('auth'), null);
});

test('replacing a value leaves no entries from the old one behind', async () => {
  const { backend, data } = memoryBackend();
  const store = createChunkedStore(backend);
  await store.set('auth', session(9000, 'a'));
  await store.set('auth', session(100, 'b'));
  assert.equal(await store.get('auth'), session(100, 'b'));
  assert.equal(data.size, 2);
  await store.set('auth', session(4000, 'c'));
  assert.equal(await store.get('auth'), session(4000, 'c'));
});

test('an interrupted save keeps the previous value readable', async () => {
  const { backend, failOn } = memoryBackend();
  const store = createChunkedStore(backend);
  const original = session(5000, 'a');
  await store.set('auth', original);

  failOn('.b.1');
  await assert.rejects(store.set('auth', session(5000, 'b')));
  assert.equal(await store.get('auth'), original);

  failOn('.meta');
  await assert.rejects(store.set('auth', session(5000, 'c')));
  assert.equal(await store.get('auth'), original);

  await store.set('auth', session(5000, 'd'));
  assert.equal(await store.get('auth'), session(5000, 'd'));
});

test('removing clears every entry', async () => {
  const { backend, data } = memoryBackend();
  const store = createChunkedStore(backend);
  await store.set('auth', session(6000));
  await store.remove('auth');
  assert.equal(await store.get('auth'), null);
  assert.equal(data.size, 0);
});

test('a missing chunk or damaged marker reads as null instead of a broken value', async () => {
  const { backend, data } = memoryBackend();
  const store = createChunkedStore(backend);
  await store.set('auth', session(5000));
  data.delete('auth.a.1');
  assert.equal(await store.get('auth'), null);
  data.set('auth.meta', 'garbage');
  assert.equal(await store.get('auth'), null);
});
