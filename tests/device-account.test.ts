import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accountStashKey, forgetDeviceAccount, switchDeviceAccount, type KeyValueStore } from '../src/services/device-account.ts';

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async (key) => { data.delete(key); },
    multiGet: async (keys) => keys.map((key) => [key, data.get(key) ?? null] as const),
    multiSet: async (pairs) => { for (const [key, value] of pairs) data.set(key, value); },
    multiRemove: async (keys) => { for (const key of keys) data.delete(key); },
  };
  return { store, data };
}

const KEYS = ['subjects', 'flashcards', 'dirty'];

test('a new account starts empty and the old account data is put away, not lost', async () => {
  const { store, data } = memoryStore({ subjects: '["Anatomy"]', flashcards: '[1,2]', dirty: '1', device_setting: 'keep' });
  await switchDeviceAccount(store, 'anna', 'ben', KEYS);
  assert.equal(data.get('subjects'), undefined);
  assert.equal(data.get('flashcards'), undefined);
  assert.equal(data.get('dirty'), undefined);
  assert.equal(data.get('device_setting'), 'keep');
  const stash = JSON.parse(data.get(accountStashKey('anna')) ?? '{}');
  assert.deepEqual(stash.values, { subjects: '["Anatomy"]', flashcards: '[1,2]', dirty: '1' });
});

test('signing back in brings the account data back, including unsynced changes', async () => {
  const { store, data } = memoryStore({ subjects: '["Anatomy"]', dirty: '1' });
  await switchDeviceAccount(store, 'anna', 'ben', KEYS);
  await store.setItem('subjects', '["Surgery"]');
  await switchDeviceAccount(store, 'ben', 'anna', KEYS);
  assert.equal(data.get('subjects'), '["Anatomy"]');
  assert.equal(data.get('dirty'), '1');
  assert.equal(data.get(accountStashKey('anna')), undefined);
  assert.deepEqual(JSON.parse(data.get(accountStashKey('ben')) ?? '{}').values, { subjects: '["Surgery"]' });
});

test('the same account, or a missing account, changes nothing', async () => {
  const { store, data } = memoryStore({ subjects: '["Anatomy"]' });
  await switchDeviceAccount(store, 'anna', 'anna', KEYS);
  await switchDeviceAccount(store, '', 'ben', KEYS);
  assert.equal(data.get('subjects'), '["Anatomy"]');
  assert.equal(data.size, 1);
});

test('a damaged stash gives an empty start instead of a crash, and unknown keys are ignored', async () => {
  const { store, data } = memoryStore({ subjects: '["Anatomy"]', [accountStashKey('ben')]: 'not json' });
  await switchDeviceAccount(store, 'anna', 'ben', KEYS);
  assert.equal(data.get('subjects'), undefined);

  const other = memoryStore({ [accountStashKey('ben')]: JSON.stringify({ savedAt: 'x', values: { subjects: '["Surgery"]', something_else: 'no', flashcards: 5 } }) });
  await switchDeviceAccount(other.store, 'anna', 'ben', KEYS);
  assert.equal(other.data.get('subjects'), '["Surgery"]');
  assert.equal(other.data.get('something_else'), undefined);
  assert.equal(other.data.get('flashcards'), undefined);
});

test('deleting an account removes its data and its stash from the device', async () => {
  const { store, data } = memoryStore({ subjects: '["Anatomy"]', [accountStashKey('anna')]: '{}', [accountStashKey('ben')]: '{}', device_setting: 'keep' });
  await forgetDeviceAccount(store, 'anna', KEYS);
  assert.deepEqual([...data.keys()].sort(), [accountStashKey('ben'), 'device_setting'].sort());
});
