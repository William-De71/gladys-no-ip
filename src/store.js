// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/noip.json (the only
// writable place of the container):
//   - `public`    per family (`ipv4`, `ipv6`): the last public address read
//                 and when it changed, so a restart never fires "public
//                 address changed" again and the first reading is a baseline;
//   - `records`   per record (`<name>|<family>`): the address No-IP
//                 confirmed (`ip`, `at`), the last call (`sentAt`), the last
//                 resend of a name resolving elsewhere (`driftAt`), the last
//                 error (`error`, `message`, `errorAt`) and the number of
//                 changes applied (`changes`). A refused name is not asked
//                 again after a restart, and a record already right is never
//                 sent again;
//   - `account`   the error of the whole account (`error`, `message`,
//                 `errorAt`) and the time No-IP may be called again after a
//                 server failure (`retryAt`), the last call (`sentAt`).
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/noip.json';
const EMPTY = () => ({ public: {}, records: {}, account: {} });

/**
 * @description The key of a record.
 * @param {string} hostname - The name.
 * @param {string} family - `ipv4` or `ipv6`.
 * @returns {string} "home.ddns.net|ipv4".
 */
const recordKey = (hostname, family) => `${hostname}|${family}`;

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save, record }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const value = raw && typeof raw === 'object' ? raw : {};
        const part = (name) =>
          value[name] && typeof value[name] === 'object' && !Array.isArray(value[name])
            ? value[name]
            : {};
        store.data = {
          public: part('public'),
          records: part('records'),
          account: part('account'),
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
    /**
     * @description The state of a record, created empty when unknown.
     * @param {string} hostname - The name.
     * @param {string} family - `ipv4` or `ipv6`.
     * @returns {object} `{ ip, at, sentAt, driftAt, error, message, errorAt, changes }`.
     */
    record(hostname, family) {
      const key = recordKey(hostname, family);
      const current = store.data.records[key];
      if (!current || typeof current !== 'object') {
        store.data.records[key] = { ip: '', at: 0, sentAt: 0, error: '', changes: 0 };
      }
      return store.data.records[key];
    },
  };
  return store;
}

export { DEFAULT_PATH, recordKey, createStore };
