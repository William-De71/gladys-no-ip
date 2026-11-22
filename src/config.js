// -----------------------------------------------------------------------------
// Configuration of the No-IP integration.
//
// Fields of the config_schema:
//   - `username`    the No-IP account (an e-mail address or a username), or
//                   the username of a DDNS Key;
//   - `password`    its password (secret);
//   - `hostnames`   the names to keep up to date, separated by commas:
//                   hostnames (home.ddns.net), groups (a No-IP group name),
//                   or `all.ddnskey.com` for every name of a DDNS Key;
//   - `records`     which addresses follow the public ones: `ipv4` (A),
//                   `ipv6` (AAAA) or `both`;
//   - `interval`    seconds between two checks of the public address;
//   - `language`    language of the device names, the status texts and the
//                   scene summaries: `auto` follows the last widget request.
//
// Internal key, outside the config_schema (stored by setConfig):
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { isLanguage } from './i18n.js';

// No-IP takes a list of names in one request; ten is far more than a home needs.
const MAX_NAMES = 10;
// A check reads the public address from an echo service and resolves each
// name: cheap. No-IP is only called when a name must change.
const INTERVALS = [60, 300, 900, 1800];
const DEFAULT_INTERVAL = 300;
const FAMILIES = ['ipv4', 'ipv6'];
const RECORDS = { ipv4: ['ipv4'], ipv6: ['ipv6'], both: ['ipv4', 'ipv6'] };
const DEFAULT_RECORDS = 'ipv4';
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
// The name of a DDNS Key: every hostname the key covers.
const DDNS_KEY_NAME = 'all.ddnskey.com';
// A DNS name: labels of letters, digits and hyphens, at least one dot.
const HOSTNAME =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// A group name: no dot, letters, digits, hyphens and underscores.
const GROUP = /^[a-z0-9][a-z0-9_-]{0,49}$/;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read a value among allowed numbers.
 * @param {unknown} raw - The raw value ("300", 300).
 * @param {number[]} allowed - The allowed values.
 * @param {number} fallback - The default.
 * @returns {number} The value.
 */
function readChoice(raw, allowed, fallback) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  return allowed.includes(value) ? value : fallback;
}

/**
 * @description A name as No-IP expects it, from what a user may paste.
 * @param {unknown} raw - The typed name.
 * @returns {{ name: string, kind: 'host'|'group'|'key' }|null} The lowercase
 * name and what it is, null when it cannot be one.
 * @example
 * readName(' https://Home.ddns.net./ '); // -> { name: 'home.ddns.net', kind: 'host' }
 */
function readName(raw) {
  const value = readString(raw)
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
  if (value === DDNS_KEY_NAME) {
    return { name: value, kind: 'key' };
  }
  if (HOSTNAME.test(value)) {
    return { name: value, kind: 'host' };
  }
  return GROUP.test(value) ? { name: value, kind: 'group' } : null;
}

/**
 * @description The names of the setting, in order, without doubles.
 * @param {unknown} raw - "home.ddns.net, nas.ddns.net".
 * @returns {{ names: Array<object>, invalid: string[] }} The valid names
 * (MAX_NAMES at most) and the entries that are not names.
 */
function readNames(raw) {
  const names = [];
  const invalid = [];
  const seen = new Set();
  for (const entry of readString(raw)
    .split(/[,;\s]+/)
    .filter(Boolean)) {
    const found = readName(entry);
    if (!found) {
      invalid.push(entry.slice(0, 60));
    } else if (!seen.has(found.name) && names.length < MAX_NAMES) {
      seen.add(found.name);
      names.push(found);
    }
  }
  return { names, invalid };
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ account: { username, password }, hosts: [{ hostname,
 * kind, families }], invalid, interval, language, fingerprint }`, no host
 * without a username and a password. `fingerprint` changes whenever what is
 * sent to No-IP changes (never stored: it derives from the password).
 * @example
 * normalizeConfig({ username: 'me@example.com', password: 'x', hostnames: 'home.ddns.net' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const account = { username: readString(config.username), password: readString(config.password) };
  const records = readString(config.records);
  const families = RECORDS[records] ?? RECORDS[DEFAULT_RECORDS];
  const { names, invalid } = readNames(config.hostnames);
  const hosts =
    account.username && account.password
      ? names.map(({ name, kind }) => ({ hostname: name, kind, families }))
      : [];
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([account.username, account.password, families, hosts.map((h) => h.hostname)]),
    )
    .digest('hex');
  return {
    account,
    hosts,
    invalid,
    interval: readChoice(config.interval, INTERVALS, DEFAULT_INTERVAL),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
    fingerprint,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_NAMES,
  INTERVALS,
  DEFAULT_INTERVAL,
  FAMILIES,
  RECORDS,
  DEFAULT_RECORDS,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  DDNS_KEY_NAME,
  readName,
  readNames,
  normalizeConfig,
  readLanguage,
};
