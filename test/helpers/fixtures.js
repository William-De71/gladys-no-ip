// A fake network for the tests, served through the `fetch` option of the
// integration: the echo services answer the public address of the home in
// plain text, and the update endpoint of No-IP answers like the real one (one
// line per name: `good <ip>[,<ipv6>]`, `nochg …`, `nohost`; `badauth` with an
// HTTP 401 for a wrong login, observed on 2026-11-22; `911`, `abuse`…). A
// fake resolver stands for the DNS. Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-11-22T10:00:00Z');
const TZ = 'Europe/Paris';
const HOSTNAME = 'home.ddns.net';
const USERNAME = 'me@example.com';
const PASSWORD = 's3cret-Pa55';
const IPV4 = '203.0.113.7';
const IPV4_NEW = '198.51.100.23';
const IPV6 = '2001:db8:85a3::8a2e:370:7334';
const NOIP = 'https://dynupdate.no-ip.com/nic/update';
const SERVICES = {
  ipv4: ['https://api.ipify.org', 'https://ipv4.icanhazip.com'],
  ipv6: ['https://api6.ipify.org', 'https://ipv6.icanhazip.com'],
};

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'noip-')), 'noip.json');

/**
 * @description A Gladys client enough for building devices.
 */
const fakeGladys = {
  externalIds(type, key) {
    const device = `ext:no-ip:${type}:${key}`;
    return { device, feature: (feature) => `${device}:${feature}` };
  },
};

/**
 * @description A text answer.
 * @param {number} status - The HTTP status.
 * @param {string} body - The body.
 * @param {string} [type] - The content type.
 * @returns {Response} The answer.
 */
const answer = (status, body, type = 'text/plain') =>
  new Response(body, { status, headers: { 'content-type': type } });

/**
 * @description The fake network.
 * @returns {Function} A `fetch`, with `calls` (the No-IP calls: `{ names,
 * myip, username, password, agent }`), `echoes` (the echo services asked),
 * `public` (the address per family the echo services answer, '' for none),
 * `records` (what No-IP holds, `<name>|<family>` → address), `accounts`
 * (username → `{ password, hosts }`), `down` (echo services that fail) and
 * `noip` (null, `'down'`, `'error'`, `'abuse'`, `'911'`, `'badagent'`).
 */
function fakeNet() {
  const net = async (url, init = {}) => {
    const { origin, searchParams } = new URL(url);
    if (url.startsWith(NOIP)) {
      if (net.noip === 'down') {
        throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
      }
      const [scheme, encoded] = String(init.headers?.authorization ?? '').split(' ');
      const [username, password] =
        scheme === 'Basic' ? Buffer.from(encoded, 'base64').toString().split(':') : [];
      const names = String(searchParams.get('hostname') ?? '').split(',');
      const myip = String(searchParams.get('myip') ?? '');
      net.calls.push({ names, myip, username, password, agent: init.headers?.['user-agent'] });
      const account = net.accounts[username];
      if (!account || account.password !== password) {
        return answer(401, 'badauth');
      }
      if (net.noip === 'error') {
        return answer(502, '<html>Bad gateway</html>', 'text/html');
      }
      if (['abuse', '911', 'badagent'].includes(net.noip)) {
        return answer(200, net.noip);
      }
      const ips = myip.split(',').filter(Boolean);
      const lines = names.map((name) => {
        if (!account.hosts.includes(name)) {
          return 'nohost';
        }
        let changed = false;
        for (const ip of ips) {
          const key = `${name}|${ip.includes(':') ? 'ipv6' : 'ipv4'}`;
          if (net.records[key] !== ip) {
            net.records[key] = ip;
            changed = true;
          }
        }
        return `${changed ? 'good' : 'nochg'} ${ips.join(',')}`;
      });
      return answer(200, `${lines.join('\n')}\n`);
    }
    const family = Object.keys(SERVICES).find((name) => SERVICES[name].includes(origin));
    if (family) {
      net.echoes.push(origin);
      if (net.down.includes(origin)) {
        throw new TypeError('fetch failed', {
          cause: Object.assign(new Error('x'), { code: 'ETIMEDOUT' }),
        });
      }
      return net.public[family]
        ? answer(200, `${net.public[family]}\n`)
        : answer(503, 'Service Unavailable');
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  net.calls = [];
  net.echoes = [];
  net.public = { ipv4: IPV4, ipv6: IPV6 };
  net.records = {};
  net.accounts = {
    [USERNAME]: { password: PASSWORD, hosts: [HOSTNAME, 'nas.ddns.net', 'cameras'] },
  };
  net.down = [];
  net.noip = null;
  return net;
}

/**
 * @description A fake DNS resolver: the records No-IP holds, unless the
 * test sets its own answers (`zone`, `<hostname>|<family>` → address).
 * @param {object} net - The fake network.
 * @returns {object} `{ resolve4, resolve6, zone, asked }`.
 */
function fakeResolver(net) {
  const resolver = {
    zone: null,
    asked: [],
    async lookup(hostname, family) {
      resolver.asked.push(`${hostname}|${family}`);
      const zone = resolver.zone ?? net.records;
      const ip = zone[`${hostname}|${family}`];
      if (!ip) {
        throw Object.assign(new Error(`queryA ENODATA ${hostname}`), { code: 'ENODATA' });
      }
      return [ip];
    },
    resolve4: (hostname) => resolver.lookup(hostname, 'ipv4'),
    resolve6: (hostname) => resolver.lookup(hostname, 'ipv6'),
  };
  return resolver;
}

export {
  NOW,
  TZ,
  HOSTNAME,
  USERNAME,
  PASSWORD,
  IPV4,
  IPV4_NEW,
  IPV6,
  NOIP,
  SERVICES,
  silent,
  storePath,
  fakeGladys,
  fakeNet,
  fakeResolver,
};
