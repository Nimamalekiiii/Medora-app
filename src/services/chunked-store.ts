/**
 * Stores one long string as several short entries in a key-value backend.
 *
 * The iOS Keychain (expo-secure-store) is meant for small values, and a
 * sign-in session is larger than it reliably accepts, so the value is split
 * into chunks. A write goes to a fresh generation and is switched in with one
 * final small write, so an interrupted save never leaves a half-written
 * value: readers see either the old value or the new one.
 *
 * This module is pure: the backend is passed in, which keeps it testable.
 */

export type KeyValueBackend = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export const DEFAULT_CHUNK_SIZE = 1800;
const GENERATIONS = ['a', 'b'] as const;
type Generation = (typeof GENERATIONS)[number];
type Meta = { generation: Generation; count: number };

const metaKey = (key: string) => `${key}.meta`;
const chunkKey = (key: string, generation: Generation, index: number) => `${key}.${generation}.${index}`;

function parseMeta(raw: string | null): Meta | null {
  const match = raw ? /^([ab]):(\d{1,4})$/.exec(raw) : null;
  if (!match) return null;
  const count = Number(match[2]);
  return count > 0 ? { generation: match[1] as Generation, count } : null;
}

async function removeChunks(backend: KeyValueBackend, key: string, generation: Generation, count: number) {
  for (let index = 0; index < count; index += 1) {
    await backend.remove(chunkKey(key, generation, index));
  }
}

export function createChunkedStore(backend: KeyValueBackend, chunkSize: number = DEFAULT_CHUNK_SIZE) {
  return {
    /** The stored value, or null when nothing complete is stored. */
    async get(key: string): Promise<string | null> {
      const meta = parseMeta(await backend.get(metaKey(key)));
      if (!meta) return null;
      const chunks: string[] = [];
      for (let index = 0; index < meta.count; index += 1) {
        const chunk = await backend.get(chunkKey(key, meta.generation, index));
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    },

    async set(key: string, value: string): Promise<void> {
      const previous = parseMeta(await backend.get(metaKey(key)));
      const generation: Generation = previous?.generation === 'a' ? 'b' : 'a';
      const count = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let index = 0; index < count; index += 1) {
        await backend.set(chunkKey(key, generation, index), value.slice(index * chunkSize, (index + 1) * chunkSize));
      }
      // This single write is what makes the new value the current one.
      await backend.set(metaKey(key), `${generation}:${count}`);
      if (previous) await removeChunks(backend, key, previous.generation, previous.count);
    },

    async remove(key: string): Promise<void> {
      const meta = parseMeta(await backend.get(metaKey(key)));
      await backend.remove(metaKey(key));
      if (meta) await removeChunks(backend, key, meta.generation, meta.count);
    },
  };
}
