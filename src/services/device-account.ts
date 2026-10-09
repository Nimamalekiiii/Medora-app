/**
 * Keeps each account's study data apart when more than one person signs in
 * on the same phone. When a different account signs in, the data on the
 * device is put away under the account it belongs to, and the new account
 * gets its own data back (or starts empty). Nothing is deleted, so signing
 * back in brings everything back, including changes that were not synced yet.
 *
 * The storage is passed in, so this can be tested without a phone.
 */

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
};

export const accountStashKey = (userId: string) => `medexam_account_data_${userId}`;

type Stash = { savedAt: string; values: Record<string, string> };

function readStash(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<Stash>;
    if (!parsed || typeof parsed.values !== 'object' || parsed.values === null) return {};
    return Object.fromEntries(Object.entries(parsed.values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

/**
 * Puts away the data of `fromUserId` and brings out the data of `toUserId`.
 * `keys` are the storage keys that belong to an account.
 */
export async function switchDeviceAccount(store: KeyValueStore, fromUserId: string, toUserId: string, keys: readonly string[]): Promise<void> {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const current = await store.multiGet(keys);
  const values: Record<string, string> = {};
  for (const [key, value] of current) if (value !== null) values[key] = value;
  // The old account's data is saved before anything is removed.
  const stash: Stash = { savedAt: new Date().toISOString(), values };
  await store.setItem(accountStashKey(fromUserId), JSON.stringify(stash));

  const incoming = readStash(await store.getItem(accountStashKey(toUserId)));
  await store.multiRemove([...keys]);
  const allowed = new Set(keys);
  const pairs = Object.entries(incoming).filter(([key]) => allowed.has(key));
  if (pairs.length > 0) await store.multiSet(pairs);
  await store.removeItem(accountStashKey(toUserId));
}

/** Removes everything this device holds for an account, used when the account is deleted. */
export async function forgetDeviceAccount(store: KeyValueStore, userId: string, keys: readonly string[]): Promise<void> {
  await store.multiRemove([...keys]);
  if (userId) await store.removeItem(accountStashKey(userId));
}
