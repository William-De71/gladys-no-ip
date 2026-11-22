// -----------------------------------------------------------------------------
// The No-IP integration: every handler, registered on a Gladys client.
//
// Keeps No-IP names (hostnames, groups or every name of a DDNS Key) pointed
// at the public address of the home, through the official update endpoint
// (noip-api.js), following the client rules of No-IP:
//   - at each check (every 1 to 30 min, 5 by default) the public IPv4, and
//     IPv6 when followed, is read on echo services (public-ip.js);
//   - No-IP is called only when a name must change: the public address
//     differs from the one No-IP last confirmed (a hostname already right in
//     the DNS at the first check is adopted without a call), or a hostname
//     still resolves elsewhere a quarter of an hour after an update (at most
//     once every 6 hours: too many "nochg" answers get a client blocked).
//     Every name due goes in one request; never two requests within a minute;
//   - an error answer (wrong login, unknown name, client disabled, abuse…)
//     stops the updates until the user changes the settings or presses
//     "Test the connection" / "Update now"; after a No-IP failure ("911",
//     HTTP 5xx) nothing is sent for 30 minutes, whoever asks;
//   - devices (device.js): one per name, its addresses, status and number of
//     changes;
//   - scene triggers (events.js): public address changed, record updated,
//     update failed;
//   - scene actions: update now, read the public address;
//   - dashboard widget (widgets.js): the public address and every record.
//
// Transport: cloud only (No-IP and the echo services).
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK, a fake fetch and a fake resolver (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, FAMILIES, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createNoIpClient, ACCOUNT_KINDS, FATAL_KINDS } from './noip-api.js';
import { createAddressReader } from './public-ip.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { hostIds, parseHostId, buildHostDevice, buildHostStates } from './device.js';
import { TRIGGERS, OUTPUTS, pick, publicChangeData, updatedData, failedData } from './events.js';
import { WIDGETS, WIDGET_ACTIONS, messageContent, buildStatusWidget } from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const ACTIONS = { TEST_CONNECTION: 'test_connection', DIAGNOSTIC: 'diagnostic' };
const SCENE_ACTIONS = { UPDATE_NOW: 'update_now', GET_PUBLIC_IP: 'get_public_ip' };
const MINUTE_MS = 60 * 1000;
// Never two requests within a minute, whoever asks.
const MIN_GAP_MS = MINUTE_MS;
// A hostname still resolving elsewhere this long after an update was changed
// on the No-IP website (No-IP propagates within a minute or two)…
const DRIFT_MS = 15 * MINUTE_MS;
// …and is sent again at most this often (an answer "nochg" counts against us).
const DRIFT_RETRY_MS = 6 * 60 * MINUTE_MS;
// A scene asking to send names already right: at most this often per name.
const SCENE_FORCE_GAP_MS = 60 * MINUTE_MS;
// No-IP: after a "911" or an HTTP 5xx, "retry no sooner than 30 minutes".
const SERVER_RETRY_MS = 30 * MINUTE_MS;
// Errors cleared as soon as the record is right again without a call.
const TRANSIENT_KINDS = ['server', 'network', 'no_ip'];
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Create the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration instance (or the fake one).
 * @param {object} [options] - `{ fetch, baseUrl, services, resolver,
 * storePath, now, timeZone, timers, logger }` (the tests set them).
 * @returns {object} Helpers for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    services,
    resolver,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone,
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  let createdDevices = new Set();
  // The public address of each family at the last check: `{ ip, source }` or
  // `{ error, message }`.
  let publicIps = {};
  let checkedAt = 0;
  let checking = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let checkTimer = null;
  let stopped = false;

  const api = createNoIpClient({
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const addresses = createAddressReader({
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(services ? { services } : {}),
    ...(resolver ? { resolver } : {}),
  });
  const store = createStore({ path: storePath, logger });
  const recordOf = (hostname, family) => store.record(hostname, family);
  const account = () => store.data.account;

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Lift the stops a refusal put: the user changed something.
   */
  function clearStops() {
    const acct = account();
    if (FATAL_KINDS.includes(acct.error)) {
      Object.assign(acct, { error: '', message: '' });
    }
    for (const record of Object.values(store.data.records)) {
      if (record && FATAL_KINDS.includes(record.error)) {
        Object.assign(record, { error: '', message: '' });
      }
    }
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The first record in error, if any.
   * @returns {{ hostname: string, family: string, record: object }|null} It.
   */
  function firstError() {
    for (const host of config.hosts) {
      for (const family of host.families) {
        const record = recordOf(host.hostname, family);
        if (record.error) {
          return { hostname: host.hostname, family, record };
        }
      }
    }
    return null;
  }

  /**
   * @description Work out the connection status from the last check.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (config.hosts.length === 0) {
      await reportStatus(
        false,
        config.invalid.length > 0
          ? all('statusInvalid', { names: config.invalid.join(', ') })
          : all('statusNoHost'),
      );
      return;
    }
    const acct = account();
    if (ACCOUNT_KINDS.includes(acct.error)) {
      await reportStatus(
        false,
        all('statusStopped', (lang) => ({ error: t(`status_${acct.error}`, lang) })),
      );
      return;
    }
    if (!checkedAt) {
      return;
    }
    const failure = firstError();
    if (failure) {
      await reportStatus(
        false,
        all('statusError', (lang) => ({
          hostname: failure.hostname,
          error: t(`status_${failure.record.error}`, lang),
        })),
      );
      return;
    }
    if (config.invalid.length > 0) {
      await reportStatus(false, all('statusInvalid', { names: config.invalid.join(', ') }));
      return;
    }
    await reportStatus(
      true,
      all('statusConnected', {
        count: config.hosts.length,
        ip: publicIps.ipv4?.ip ?? publicIps.ipv6?.ip ?? '',
        minutes: Math.max(1, Math.round(config.interval / 60)),
      }),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widget to pull its content again.
   */
  function refreshWidget() {
    Promise.resolve(gladys.requestWidgetRefresh(WIDGETS.STATUS)).catch(() => {});
  }

  /**
   * @description Offer the devices on the Discovery screen, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = config.hosts.map((host) => buildHostDevice(gladys, host, lang));
    const signature = JSON.stringify(devices);
    if (!force && signature === lastDiscovery) {
      return devices.length;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
    return devices.length;
  }

  /**
   * @description Publish the states of the created devices that changed.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = config.hosts
      .filter((host) => createdDevices.has(hostIds(gladys, host.hostname).device))
      .flatMap((host) => buildHostStates(gladys, host, recordOf, lang));
    if (states.length === 0) {
      return;
    }
    try {
      await gladys.publishChangedStates(states, { heartbeat: 30 * MINUTE_MS });
    } catch (err) {
      logger.warn(`Unable to publish the states: ${err.message}`);
    }
  }

  /**
   * @description Fire a scene event, never failing the check.
   * @param {string} key - The trigger.
   * @param {object} data - The flat data.
   * @returns {Promise<void>}
   */
  async function fire(key, data) {
    logger.info(`${key}: ${JSON.stringify(data)}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to fire ${key}: ${err.message}`);
    }
  }

  // --- The check ---------------------------------------------------------------------

  /**
   * @description Read the public address of each family followed.
   * @param {string[]} families - The families.
   * @param {boolean} silent - True when no event may fire (a scene action
   * asked): the stored address is then left as it was, so the next check
   * still fires the change.
   * @returns {Promise<Array<object>>} The events to fire.
   */
  async function readPublicAddresses(families, silent) {
    const events = [];
    for (const family of families) {
      try {
        const { ip, source } = await addresses.publicAddress(family);
        publicIps[family] = { ip, source };
        const before = store.data.public[family];
        if (before?.ip === ip || silent) {
          continue;
        }
        if (before?.ip) {
          logger.info(`Public ${family} address: ${before.ip} -> ${ip}`);
          events.push({
            key: TRIGGERS.PUBLIC_IP_CHANGED,
            data: publicChangeData(family, before.ip, ip),
          });
        }
        store.data.public[family] = { ip, at: now() };
      } catch (err) {
        logger.warn(err.message);
        publicIps[family] = { error: 'no_ip', message: err.message };
      }
    }
    return events;
  }

  /**
   * @description Whether a name must be sent to No-IP.
   * @param {object} host - The configured name.
   * @param {object} mode - `{ force, human }`.
   * @returns {Promise<boolean>} True to send it.
   */
  async function isDue(host, { force, human }) {
    const families = host.families.filter((family) => publicIps[family]?.ip);
    const records = families.map((family) => recordOf(host.hostname, family));
    if (families.length === 0) {
      return false;
    }
    if (!human && records.some((record) => FATAL_KINDS.includes(record.error))) {
      return false;
    }
    if (human) {
      return true;
    }
    if (force && records.every((record) => now() - (record.sentAt || 0) >= SCENE_FORCE_GAP_MS)) {
      return true;
    }
    let due = false;
    for (const [index, family] of families.entries()) {
      const record = records[index];
      const ip = publicIps[family].ip;
      // Groups and DDNS Keys are no DNS names: only No-IP knows their address.
      const resolved = host.kind === 'host' ? await addresses.resolve(host.hostname, family) : '';
      if (record.ip !== ip) {
        // First check of a hostname, or after a restart: already right, no call.
        if (!record.ip && resolved === ip) {
          Object.assign(record, { ip, at: now(), error: '', message: '' });
        } else {
          due = true;
        }
      } else if (
        resolved &&
        resolved !== ip &&
        now() - (record.at || 0) >= DRIFT_MS &&
        now() - (record.driftAt || 0) >= DRIFT_RETRY_MS
      ) {
        record.driftAt = now();
        due = true;
      }
    }
    return due;
  }

  /**
   * @description Record an error on a name, and the event when it is new.
   * @param {object} host - The configured name.
   * @param {string} family - `ipv4` or `ipv6`.
   * @param {string} kind - The error kind.
   * @param {string} message - The message.
   * @param {Array<object>} events - The events to fire.
   */
  function failRecord(host, family, kind, message, events) {
    const record = recordOf(host.hostname, family);
    if (record.error !== kind) {
      events.push({
        key: TRIGGERS.UPDATE_FAILED,
        data: failedData({
          host: hostIds(gladys, host.hostname).device,
          hostname: host.hostname,
          family,
          ip: publicIps[family]?.ip ?? '',
          error: kind,
          message,
        }),
      });
    }
    Object.assign(record, { error: kind, message: String(message).slice(0, 200), errorAt: now() });
  }

  /**
   * @description Send the names due in one request, and record the answers.
   * @param {object[]} due - The configured names to send.
   * @param {Array<object>} events - The events to fire.
   * @returns {Promise<Set<string>>} The `<name>|<family>` changed by No-IP.
   */
  async function send(due, events) {
    const acct = account();
    const changed = new Set();
    const ips = {};
    for (const family of FAMILIES) {
      if (due.some((host) => host.families.includes(family)) && publicIps[family]?.ip) {
        ips[family] = publicIps[family].ip;
      }
    }
    acct.sentAt = now();
    for (const host of due) {
      for (const family of host.families) {
        recordOf(host.hostname, family).sentAt = now();
      }
    }
    let answers;
    try {
      answers = await api.update(
        config.account,
        due.map((host) => host.hostname),
        ips,
      );
    } catch (err) {
      logger.warn(`No-IP: ${err.kind ?? 'error'}: ${err.message}`);
      const kind = err.kind ?? 'server';
      if (ACCOUNT_KINDS.includes(kind)) {
        Object.assign(acct, { error: kind, message: err.message.slice(0, 200), errorAt: now() });
      }
      if (kind === 'server') {
        acct.retryAt = now() + SERVER_RETRY_MS;
      }
      for (const host of due) {
        for (const family of host.families) {
          failRecord(host, family, kind, err.message, events);
        }
      }
      return changed;
    }
    Object.assign(acct, { error: '', message: '' });
    due.forEach((host, index) => {
      const answer = answers[index];
      if (answer.result === 'error') {
        const message = `No-IP answered "${answer.code}"`;
        logger.warn(`${host.hostname}: ${message}`);
        if (ACCOUNT_KINDS.includes(answer.kind)) {
          Object.assign(acct, { error: answer.kind, message, errorAt: now() });
        }
        if (answer.kind === 'server') {
          acct.retryAt = now() + SERVER_RETRY_MS;
        }
        for (const family of host.families) {
          failRecord(host, family, answer.kind, message, events);
        }
        return;
      }
      logger.info(
        `${host.hostname}: ${answer.result} ${[answer.ipv4, answer.ipv6].filter(Boolean)}`,
      );
      for (const family of host.families) {
        const ip = answer[family] ?? ips[family];
        if (!ip) {
          continue;
        }
        const record = recordOf(host.hostname, family);
        const previous = record.ip;
        Object.assign(record, { ip, at: now(), error: '', message: '' });
        if (answer.result === 'good' && previous !== ip) {
          record.changes = (Number(record.changes) || 0) + 1;
          changed.add(`${host.hostname}|${family}`);
          events.push({
            key: TRIGGERS.RECORD_UPDATED,
            data: updatedData({
              host: hostIds(gladys, host.hostname).device,
              hostname: host.hostname,
              family,
              ip,
              previous,
            }),
          });
        }
      }
    });
    return changed;
  }

  /**
   * @description Check the public address and every name, send those that
   * must change, then publish devices, states and events. Concurrent calls
   * wait for each other.
   * @param {object} [options] - `{ force, human, hostname, silent }`: `force`
   * sends names already right (a scene: once an hour per name at most),
   * `human` is a person asking (test, widget button): it lifts the stops of a
   * refusal and sends every name; `hostname` limits the check to one name;
   * `silent` fires no event (asked by a scene action).
   * @returns {Promise<object>} `{ updated, unchanged, failed, waited, results }`,
   * `results` per record `{ hostname, family, outcome, ip, error }`.
   */
  function check({ force = false, human = false, hostname = '', silent = false } = {}) {
    const previous = checking ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
        const hosts = config.hosts.filter((host) => !hostname || host.hostname === hostname);
        const summary = { updated: 0, unchanged: 0, failed: 0, waited: false, results: [] };
        try {
          if (hosts.length > 0) {
            const events = await readPublicAddresses(
              FAMILIES.filter((family) => hosts.some((host) => host.families.includes(family))),
              silent,
            );
            const acct = account();
            if (human) {
              clearStops();
            }
            const due = [];
            for (const host of hosts) {
              for (const family of host.families) {
                if (!publicIps[family]?.ip) {
                  failRecord(host, family, 'no_ip', publicIps[family]?.message ?? '', events);
                }
              }
              if (await isDue(host, { force, human })) {
                due.push(host);
              }
            }
            let changed = new Set();
            if (due.length > 0) {
              if (ACCOUNT_KINDS.includes(acct.error)) {
                // Stopped: a refused account is never asked again unattended.
              } else if (now() < (acct.retryAt || 0) || now() - (acct.sentAt || 0) < MIN_GAP_MS) {
                summary.waited = true;
              } else {
                changed = await send(due, events);
              }
            }
            for (const host of hosts) {
              for (const family of host.families) {
                const record = recordOf(host.hostname, family);
                const ip = publicIps[family]?.ip;
                if (TRANSIENT_KINDS.includes(record.error) && ip && record.ip === ip) {
                  Object.assign(record, { error: '', message: '' });
                }
                let outcome = 'unchanged';
                if (changed.has(`${host.hostname}|${family}`)) {
                  outcome = 'updated';
                } else if (record.error || (ACCOUNT_KINDS.includes(acct.error) && !record.ip)) {
                  outcome = 'failed';
                }
                summary[outcome] += 1;
                summary.results.push({
                  hostname: host.hostname,
                  family,
                  outcome,
                  ip: record.ip,
                  error: record.error || (outcome === 'failed' ? acct.error : ''),
                });
              }
            }
            checkedAt = now();
            await store.save();
            if (!silent) {
              for (const { key, data } of events) {
                await fire(key, data);
              }
            }
          }
          await publishDiscoveredDevices();
          await publishStates();
          refreshWidget();
        } catch (err) {
          logger.error('Check failed', err);
        } finally {
          await refreshStatus();
        }
        return summary;
      });
    checking = current.finally(() => {
      if (checking === current) {
        checking = null;
      }
    });
    return current;
  }

  /**
   * @description Apply the configuration: check now, set the timer.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    clearInterval(checkTimer);
    lastDiscovery = null;
    await check();
    if (timers && !stopped) {
      checkTimer = setInterval(() => {
        check().catch(() => {});
      }, config.interval * 1000);
      checkTimer.unref?.();
    }
  }

  /**
   * @description One line per record: "home.ddns.net (A): 203.0.113.7".
   * @param {Array<object>} results - The results of a check.
   * @param {string} lang - The language.
   * @returns {string} The lines.
   */
  function resultLines(results, lang) {
    return results
      .map(({ hostname, family, outcome, ip, error }) => {
        const type = family === 'ipv6' ? 'AAAA' : 'A';
        let state;
        if (outcome === 'failed') {
          state = t(`status_${error || 'server'}`, lang);
        } else if (!ip) {
          state = t('status_pending', lang);
        } else {
          state = t(outcome === 'updated' ? 'lineUpdated' : 'lineUnchanged', lang, { ip });
        }
        return t('resultLine', lang, { record: `${hostname} (${type})`, state });
      })
      .join('\n');
  }

  /**
   * @description The summary of a check, in a language.
   * @param {object} summary - The result of check().
   * @param {string} lang - The language.
   * @returns {string} The summary.
   */
  function summaryText(summary, lang) {
    if (config.hosts.length === 0) {
      return t('statusNoHost', lang);
    }
    return t('summaryCheck', lang, {
      updated: summary.updated,
      unchanged: summary.unchanged,
      failed: summary.failed,
      lines: resultLines(summary.results, lang),
    });
  }

  // --- Widget ------------------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.STATUS, async ({ language: lang }) => {
    rememberLanguage(lang);
    // Never a check here: the widget answers within 15 s, a check may not.
    if (config.hosts.length === 0) {
      return messageContent(t('widgetNoHost', lang));
    }
    return buildStatusWidget({
      hosts: config.hosts,
      publicIps,
      recordOf,
      checkedAt,
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetAction(WIDGETS.STATUS, async (actionKey) => {
    if (actionKey !== WIDGET_ACTIONS.UPDATE) {
      throw new Error(`Unknown widget action ${actionKey}`);
    }
    if (config.hosts.length === 0) {
      return all('statusNoHost');
    }
    const summary = await check({ human: true });
    return all('toastChecked', {
      updated: summary.updated,
      unchanged: summary.unchanged,
      failed: summary.failed,
    });
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.UPDATE_NOW, async (fields = {}) => {
    const hostname = fields.host ? parseHostId(fields.host) : '';
    if (fields.host && !config.hosts.some((host) => host.hostname === hostname)) {
      throw new Error(`Not a No-IP name of the configuration: ${String(fields.host).slice(0, 80)}`);
    }
    // Never an event for what a scene asked: the scene reads the outputs.
    const summary = await check({ force: fields.force === true, hostname, silent: true });
    return pick({ ...summary, summary: summaryText(summary, textLanguage()) }, OUTPUTS.update_now);
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_PUBLIC_IP, async () => {
    const found = {};
    for (const family of FAMILIES) {
      try {
        found[family] = (await addresses.publicAddress(family)).ip;
      } catch {
        found[family] = '';
      }
    }
    const lang = textLanguage();
    const unknown = t('valueUnknown', lang);
    return pick(
      {
        ipv4: found.ipv4,
        ipv6: found.ipv6,
        summary: t('summaryPublic', lang, {
          ipv4: found.ipv4 || unknown,
          ipv6: found.ipv6 || unknown,
        }),
      },
      OUTPUTS.get_public_ip,
    );
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (config.hosts.length === 0) {
      return config.invalid.length > 0
        ? all('statusInvalid', { names: config.invalid.join(', ') })
        : all('statusNoHost');
    }
    const summary = await check({ human: true });
    let key = summary.failed > 0 ? 'testFailed' : 'testOk';
    if (summary.waited) {
      key = 'testWait';
    }
    const acct = account();
    const minutes = now() < (acct.retryAt || 0) ? 30 : 1;
    return Object.fromEntries(
      LANGUAGES.map((lang) => [
        lang,
        t(key, lang, { minutes, lines: resultLines(summary.results, lang) }).slice(0, 1000),
      ]),
    );
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const { password } = config.account;
    const report = {
      version: VERSION,
      config: {
        ...config,
        account: {
          username: config.account.username,
          password: password ? `${password.length} characters` : '',
        },
        fingerprint: undefined,
      },
      checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
      publicIps,
      store: store.data,
      created: [...createdDevices],
      requests: api.requests,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `No-IP diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishStates();
    refreshWidget();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    const before = config.fingerprint;
    await loadConfig(raw);
    if (config.fingerprint !== before) {
      // The user changed what is sent to No-IP: the refusals may be fixed.
      clearStops();
    }
    logger.info(`Configuration updated: ${config.hosts.length} No-IP name(s)`);
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(checkTimer);
    await store.save();
  });

  return {
    store,
    api,
    check,
    applyConfig,
    getConfig: () => config,
    getPublicIps: () => publicIps,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  MIN_GAP_MS,
  DRIFT_MS,
  DRIFT_RETRY_MS,
  SCENE_FORCE_GAP_MS,
  SERVER_RETRY_MS,
};
