// -----------------------------------------------------------------------------
// The update endpoint of No-IP (https://www.noip.com/integrate/request).
//
//   GET https://dynupdate.no-ip.com/nic/update?hostname=<a>,<b>&myip=<ipv4>,<ipv6>
//   Authorization: Basic <username>:<password>
//   User-Agent: <company> <program>/<version> <maintainer contact>
//
// `hostname` lists the hostnames and groups to update (a DDNS Key uses the
// name `all.ddnskey.com`); the answer has one line per name, in the same
// order (https://www.noip.com/integrate/response):
//   `good <ip>[,<ipv6>]`   updated;
//   `nochg <ip>[,<ipv6>]`  already right (too many of them get a client
//                          blocked: never send an address No-IP has);
//   `nohost`               no such hostname or group under this account;
//   `badauth`              wrong username or password (HTTP 401, checked on
//                          2026-11-22);
//   `badagent`             client disabled;
//   `!donator`             a paid feature was asked;
//   `abuse`                account blocked;
//   `911`                  No-IP failed: retry no sooner than 30 minutes (and
//                          so for an HTTP 5xx).
// Any error must stop the updates until the user changes the settings.
//
// Error kinds (`kind`): `auth`, `nohost`, `badagent`, `donator`, `abuse`
// (stop), `server` (wait 30 min), `network` (unreachable).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const BASE_URL = 'https://dynupdate.no-ip.com/nic/update';
const TIMEOUT_MS = 20000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
// The format No-IP asks for: "Company NameOfProgram/Version maintainer-contact".
const USER_AGENT = `Gladys-Assistant gladys-no-ip/${VERSION} https://github.com/William-De71/gladys-no-ip`;
// Kinds that stop every update of the account until the settings change.
const ACCOUNT_KINDS = ['auth', 'badagent', 'donator', 'abuse'];
// Kinds that stop the update of one name until the settings change.
const FATAL_KINDS = [...ACCOUNT_KINDS, 'nohost'];
const CODES = {
  nohost: 'nohost',
  badauth: 'auth',
  badagent: 'badagent',
  '!donator': 'donator',
  abuse: 'abuse',
  911: 'server',
};

/**
 * @description An error with its kind.
 * @param {string} kind - The kind.
 * @param {string} message - The message (never a password).
 * @returns {Error} The error.
 */
const failure = (kind, message) => Object.assign(new Error(message), { kind });

/**
 * @description Read one line of the answer.
 * @param {string} line - The line.
 * @returns {{ result: string, ipv4?: string, ipv6?: string, kind?: string }}
 * `good` / `nochg` with the addresses, or `error` with its kind.
 * @example
 * parseLine('good 203.0.113.7,2001:db8::1'); // -> { result: 'good', ipv4: '203.0.113.7', ipv6: '2001:db8::1' }
 */
function parseLine(line) {
  const text = String(line ?? '').trim();
  const success = /^(good|nochg)\b\s*(\S*)/i.exec(text);
  if (success) {
    const found = { result: success[1].toLowerCase() };
    for (const ip of success[2].split(',').filter(Boolean)) {
      found[ip.includes(':') ? 'ipv6' : 'ipv4'] = ip.toLowerCase();
    }
    return found;
  }
  const code = /^(!?[a-z0-9]+)/i.exec(text)?.[1]?.toLowerCase();
  return { result: 'error', kind: CODES[code] ?? 'server', code: text.slice(0, 40) };
}

/**
 * @description Read the answer of the endpoint for the names sent.
 * @param {number} status - The HTTP status.
 * @param {string} body - The body.
 * @param {number} count - How many names were sent.
 * @returns {Array<object>} One `parseLine` result per name, in order.
 * @throws {Error} With a `kind` when the whole request failed (account
 * refused, server error).
 */
function parseAnswer(status, body, count) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines.length > 0 ? parseLine(lines[0]) : null;
  if (status === 401 || status === 403) {
    const kind =
      first?.result === 'error' && ACCOUNT_KINDS.includes(first.kind) ? first.kind : 'auth';
    throw failure(kind, `HTTP ${status}: ${lines[0]?.slice(0, 40) || 'refused'}`);
  }
  if (status >= 500 || status === 429) {
    throw failure('server', `HTTP ${status}: No-IP failed`);
  }
  if (status < 200 || status >= 300 || !first) {
    throw failure('server', `HTTP ${status}: ${lines[0]?.slice(0, 80) || 'empty answer'}`);
  }
  // An answer about the whole account comes once, whatever the number of names.
  if (first.result === 'error' && first.kind !== 'nohost' && lines.length < count) {
    throw failure(first.kind, `No-IP answered "${first.code}"`);
  }
  if (lines.length !== count) {
    throw failure('server', `No-IP answered ${lines.length} line(s) for ${count} name(s)`);
  }
  return lines.map(parseLine);
}

/**
 * @description The client of the endpoint.
 * @param {object} [options] - `{ fetch, baseUrl }` (the tests set them).
 * @returns {object} `{ update, requests }`.
 */
function createNoIpClient({ fetch: fetchFn = globalThis.fetch, baseUrl = BASE_URL } = {}) {
  const client = {
    // Requests sent since the start, for the diagnostic.
    requests: 0,
    /**
     * @description Point names at the public addresses, in one request.
     * @param {object} account - `{ username, password }`.
     * @param {string[]} names - The hostnames and groups, as No-IP knows them.
     * @param {object} ips - `{ ipv4, ipv6 }`, each one optional.
     * @returns {Promise<Array<object>>} One result per name, in order.
     * @throws {Error} With a `kind` when the whole request failed.
     */
    async update({ username, password }, names, ips) {
      const url = new URL(baseUrl);
      const myip = [ips.ipv4, ips.ipv6].filter(Boolean).join(',');
      // URLSearchParams would encode the commas: No-IP reads them either way,
      // but its documentation shows them plain.
      url.search = `hostname=${names.map(encodeURIComponent).join(',')}&myip=${encodeURIComponent(myip).replace(/%2C/gi, ',').replace(/%3A/gi, ':')}`;
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      client.requests += 1;
      let response;
      try {
        response = await fetchFn(url.toString(), {
          headers: {
            authorization: `Basic ${credentials}`,
            'user-agent': USER_AGENT,
            accept: 'text/plain',
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        throw failure('network', `No-IP unreachable: ${err.cause?.message ?? err.message}`);
      }
      return parseAnswer(response.status, await response.text().catch(() => ''), names.length);
    },
  };
  return client;
}

export {
  BASE_URL,
  USER_AGENT,
  ACCOUNT_KINDS,
  FATAL_KINDS,
  parseLine,
  parseAnswer,
  createNoIpClient,
};
