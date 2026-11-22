// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, a fake
// network (echo services and the No-IP update endpoint) and a fake resolver.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  MIN_GAP_MS,
  DRIFT_MS,
  DRIFT_RETRY_MS,
  SCENE_FORCE_GAP_MS,
  SERVER_RETRY_MS,
} from '../src/app.js';
import { USER_AGENT } from '../src/noip-api.js';
import { TRIGGERS, OUTPUTS } from '../src/events.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import {
  fakeNet,
  fakeResolver,
  storePath,
  silent,
  NOW,
  TZ,
  HOSTNAME,
  USERNAME,
  PASSWORD,
  IPV4,
  IPV4_NEW,
  IPV6,
  SERVICES,
} from './helpers/fixtures.js';

const CONFIG = { username: USERNAME, password: PASSWORD, hostnames: HOSTNAME, language: 'fr' };
const PREFIX = 'ext:test-integration';
const HOST = `${PREFIX}:host:${HOSTNAME}`;
const NAS = 'nas.ddns.net';
const HOUR = 60 * 60 * 1000;

/**
 * @description The integration, connected to a fake Gladys and a fake network.
 * @param {object} [options] - `{ config, path, net, records }`, `records` what
 * No-IP holds before the start.
 * @returns {Promise<object>} `{ gladys, app, net, resolver, clock, path }`.
 */
async function startApp({ config = CONFIG, path = storePath(), net = fakeNet(), records } = {}) {
  if (records) {
    net.records = records;
  }
  const clock = { now: NOW };
  const resolver = fakeResolver(net);
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: net,
    services: SERVICES,
    resolver,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, net, resolver, clock, path };
}

const createAll = async (gladys) => {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
};

/**
 * @description Run a scene action and return its outputs, throw on failure.
 * @param {object} gladys - The fake Gladys.
 * @param {string} key - The scene action.
 * @param {object} [fields] - Its fields.
 * @returns {Promise<object>} The outputs.
 */
async function runScene(gladys, key, fields = {}) {
  const ack = await gladys.fake.sceneAction(key, fields);
  if (!ack.success) {
    throw new Error(ack.error);
  }
  return ack.data.outputs;
}

const events = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

/**
 * @description Move the clock on and run a check.
 * @param {object} context - `{ app, clock }`.
 * @param {number} ms - How long.
 * @param {object} [options] - The check options.
 * @returns {Promise<object>} The summary.
 */
async function later({ app, clock }, ms, options) {
  clock.now += ms;
  return app.check(options);
}

test('a name No-IP does not hold yet is sent once, with the User-Agent No-IP asks for', async () => {
  const { gladys, net } = await startApp();
  assert.equal(net.calls.length, 1);
  assert.deepEqual(
    { ...net.calls[0], agent: undefined },
    { names: [HOSTNAME], myip: IPV4, username: USERNAME, password: PASSWORD, agent: undefined },
  );
  assert.equal(net.calls[0].agent, USER_AGENT);
  assert.deepEqual(net.echoes, ['https://api.ipify.org'], 'IPv6 is not read: not followed');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /1 nom\(s\) à jour, adresse publique 203\.0\.113\.7/,
  );
  const [updated] = events(gladys, TRIGGERS.RECORD_UPDATED);
  assert.deepEqual(updated.data, {
    host: HOST,
    hostname: HOSTNAME,
    family: 'ipv4',
    ip: IPV4,
    previous_ip: '',
  });
  assert.equal(events(gladys, TRIGGERS.PUBLIC_IP_CHANGED).length, 0, 'a baseline');
});

test('a hostname already right in the DNS is adopted without a call; a group is not', async () => {
  const records = { [`${HOSTNAME}|ipv4`]: IPV4, 'cameras|ipv4': IPV4 };
  const { net } = await startApp({ records, config: { ...CONFIG, hostnames: HOSTNAME } });
  assert.equal(net.calls.length, 0);
  const group = await startApp({ records, config: { ...CONFIG, hostnames: 'cameras' } });
  assert.equal(group.net.calls.length, 1, 'a group is no DNS name');
  assert.equal(group.resolver.asked.length, 0);
});

test('a new public address: every name in one request, both events, nothing more', async () => {
  const context = await startApp({ config: { ...CONFIG, hostnames: `${HOSTNAME}, ${NAS}` } });
  const { gladys, net } = context;
  assert.equal(net.calls.length, 1);
  assert.deepEqual(net.calls[0].names, [HOSTNAME, NAS]);
  await later(context, 5 * 60 * 1000);
  assert.equal(net.calls.length, 1, 'nothing changed: no call');
  net.public.ipv4 = IPV4_NEW;
  const summary = await later(context, 5 * 60 * 1000);
  assert.equal(net.calls.length, 2);
  assert.deepEqual(net.calls[1].names, [HOSTNAME, NAS]);
  assert.equal(summary.updated, 2);
  const [change] = events(gladys, TRIGGERS.PUBLIC_IP_CHANGED);
  assert.deepEqual(change.data, { family: 'ipv4', previous_ip: IPV4, ip: IPV4_NEW });
  assert.equal(events(gladys, TRIGGERS.RECORD_UPDATED).length, 4);
  assert.equal(context.app.store.record(HOSTNAME, 'ipv4').changes, 2);
});

test('a restart neither sends again nor fires the change again', async () => {
  const first = await startApp();
  first.net.public.ipv4 = IPV4_NEW;
  await later(first, 5 * 60 * 1000);
  const again = await startApp({ path: first.path, net: first.net });
  assert.equal(first.net.calls.length, 2);
  assert.equal(events(again.gladys, TRIGGERS.PUBLIC_IP_CHANGED).length, 0);
});

test('never two requests within a minute', async () => {
  const context = await startApp();
  context.net.public.ipv4 = IPV4_NEW;
  const summary = await later(context, 30 * 1000);
  assert.equal(context.net.calls.length, 1);
  assert.equal(summary.waited, true);
  await later(context, 30 * 1000);
  assert.equal(context.net.calls.length, 2);
});

test('a refused login stops everything until the settings change, even after a restart', async () => {
  const net = fakeNet();
  net.accounts[USERNAME].password = 'other';
  const context = await startApp({ net });
  const { gladys } = context;
  assert.equal(net.calls.length, 1);
  const [failed] = events(gladys, TRIGGERS.UPDATE_FAILED);
  assert.equal(failed.data.error, 'auth');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /^Username or password refused\. Updates stopped/,
  );
  net.public.ipv4 = IPV4_NEW;
  await later(context, 24 * HOUR);
  assert.equal(net.calls.length, 1, 'never asked again unattended');
  assert.equal(events(gladys, TRIGGERS.UPDATE_FAILED).length, 1, 'once per error');
  await runScene(gladys, SCENE_ACTIONS.UPDATE_NOW, { force: true });
  assert.equal(net.calls.length, 1, 'a scene does not lift the stop');
  const restarted = await startApp({ path: context.path, net });
  assert.equal(net.calls.length, 1, 'still stopped after a restart');
  restarted.clock.now += HOUR;
  await restarted.gladys.fake.configUpdated({ ...CONFIG, interval: '900' });
  assert.equal(net.calls.length, 1, 'the same login: still stopped');
  net.accounts[USERNAME].password = PASSWORD;
  await restarted.gladys.fake.configUpdated({ ...CONFIG, interval: '900' });
  assert.equal(net.calls.length, 1, 'No-IP changed, not the settings');
  await restarted.gladys.fake.configUpdated({ ...CONFIG, password: 'other' });
  assert.equal(net.calls.length, 2, 'new settings: asked again');
});

test('the test button lifts a stop once', async () => {
  const net = fakeNet();
  net.accounts[USERNAME].password = 'other';
  const context = await startApp({ net });
  net.accounts[USERNAME].password = PASSWORD;
  context.clock.now += MIN_GAP_MS;
  const ack = await context.gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(net.calls.length, 2);
  assert.match(ack.data.message.en, /^No-IP accepted every name:/);
  assert.equal(context.gladys.fake.connectionStatus.connected, true);
});

test('an unknown group stops alone; the other names go on', async () => {
  const context = await startApp({ config: { ...CONFIG, hostnames: `${HOSTNAME}, office` } });
  const { gladys, net, app } = context;
  assert.deepEqual(net.calls[0].names, [HOSTNAME, 'office']);
  assert.equal(app.store.record('office', 'ipv4').error, 'nohost');
  assert.equal(app.store.record(HOSTNAME, 'ipv4').ip, IPV4);
  assert.match(gladys.fake.connectionStatus.message.en, /^office: Name unknown to this account/);
  net.public.ipv4 = IPV4_NEW;
  await later(context, 5 * 60 * 1000);
  assert.deepEqual(net.calls[1].names, [HOSTNAME], 'the unknown group is left out');
});

test('account codes in an answer: abuse and a disabled client stop, 911 waits 30 minutes', async () => {
  for (const code of ['abuse', 'badagent']) {
    const net = fakeNet();
    net.noip = code;
    const context = await startApp({ net });
    net.noip = null;
    await later(context, HOUR, { force: true });
    assert.equal(net.calls.length, 1, code);
    assert.equal(context.app.store.data.account.error, code);
  }
  const net = fakeNet();
  net.noip = '911';
  const context = await startApp({ net });
  assert.equal(context.app.store.record(HOSTNAME, 'ipv4').error, 'server');
  net.noip = null;
  context.clock.now += 10 * 60 * 1000;
  const ack = await context.gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(net.calls.length, 1, 'not even a person may ask within 30 minutes');
  assert.match(ack.data.message.en, /^No-IP was asked less than 30 min ago/);
  await later(context, SERVER_RETRY_MS);
  assert.equal(net.calls.length, 2);
  assert.equal(context.app.store.record(HOSTNAME, 'ipv4').error, '');
});

test('an HTTP 5xx waits 30 minutes; unreachable is asked again at the next check', async () => {
  const net = fakeNet();
  net.noip = 'error';
  const context = await startApp({ net });
  net.noip = null;
  await later(context, 5 * 60 * 1000);
  assert.equal(net.calls.length, 1);
  await later(context, SERVER_RETRY_MS);
  assert.equal(net.calls.length, 2);
  const down = fakeNet();
  down.noip = 'down';
  const other = await startApp({ net: down });
  assert.equal(other.app.store.record(HOSTNAME, 'ipv4').error, 'network');
  down.noip = null;
  await later(other, 5 * 60 * 1000);
  assert.equal(other.app.store.record(HOSTNAME, 'ipv4').error, '');
  assert.equal(down.calls.length, 1, 'the unreachable call never got through');
});

test('echo services: the next one when one fails, none means no update', async () => {
  const net = fakeNet();
  net.down = ['https://api.ipify.org'];
  const context = await startApp({ net });
  assert.deepEqual(net.echoes, ['https://api.ipify.org', 'https://ipv4.icanhazip.com']);
  assert.equal(net.calls.length, 1);
  net.public.ipv4 = '';
  await later(context, 5 * 60 * 1000);
  assert.equal(net.calls.length, 1);
  assert.equal(context.app.store.record(HOSTNAME, 'ipv4').error, 'no_ip');
  const [failed] = events(context.gladys, TRIGGERS.UPDATE_FAILED);
  assert.equal(failed.data.error, 'no_ip');
});

test('IPv4 and IPv6 in the same request, IPv6 alone too', async () => {
  const { net, gladys } = await startApp({ config: { ...CONFIG, records: 'both' } });
  assert.equal(net.calls[0].myip, `${IPV4},${IPV6}`);
  await createAll(gladys);
  assert.equal(gladys.fake.lastState(`${HOST}:ipv6`), IPV6);
  const only = await startApp({ config: { ...CONFIG, records: 'ipv6' } });
  assert.equal(only.net.calls[0].myip, IPV6);
});

test('a hostname resolving elsewhere is sent again after 15 min, at most every 6 hours', async () => {
  const context = await startApp();
  context.resolver.zone = { [`${HOSTNAME}|ipv4`]: '192.0.2.1' };
  await later(context, 5 * 60 * 1000);
  assert.equal(context.net.calls.length, 1, 'too early');
  await later(context, DRIFT_MS);
  assert.equal(context.net.calls.length, 2);
  await later(context, DRIFT_MS);
  assert.equal(context.net.calls.length, 2, 'not again before 6 hours');
  await later(context, DRIFT_RETRY_MS);
  assert.equal(context.net.calls.length, 3);
});

test('scene action "update now": outputs, a forced send at most once an hour, never an event', async () => {
  const context = await startApp();
  const { gladys, net } = context;
  const before = gladys.fake.sceneEvents.length;
  context.clock.now += MIN_GAP_MS;
  const outputs = await runScene(gladys, SCENE_ACTIONS.UPDATE_NOW, { force: true });
  assert.equal(net.calls.length, 1, 'sent less than an hour ago');
  assert.deepEqual(Object.keys(outputs), OUTPUTS.update_now);
  assert.equal(outputs.unchanged, 1);
  context.clock.now += SCENE_FORCE_GAP_MS;
  await runScene(gladys, SCENE_ACTIONS.UPDATE_NOW, { host: HOST, force: true });
  assert.equal(net.calls.length, 2);
  assert.match((await runScene(gladys, SCENE_ACTIONS.UPDATE_NOW)).summary, /^No-IP : 0 mis à jour/);
  assert.equal(gladys.fake.sceneEvents.length, before);
  await assert.rejects(
    runScene(gladys, SCENE_ACTIONS.UPDATE_NOW, { host: `${PREFIX}:host:other.ddns.net` }),
    /Not a No-IP name/,
  );
});

test('a public change seen by a scene action still fires at the next check', async () => {
  const context = await startApp();
  context.net.public.ipv4 = IPV4_NEW;
  context.clock.now += MIN_GAP_MS;
  await runScene(context.gladys, SCENE_ACTIONS.UPDATE_NOW);
  assert.equal(events(context.gladys, TRIGGERS.PUBLIC_IP_CHANGED).length, 0);
  await later(context, 5 * 60 * 1000);
  assert.equal(events(context.gladys, TRIGGERS.PUBLIC_IP_CHANGED).length, 1);
});

test('scene action "read the public address"', async () => {
  const { gladys, net } = await startApp();
  const outputs = await runScene(gladys, SCENE_ACTIONS.GET_PUBLIC_IP);
  assert.deepEqual(outputs, {
    ipv4: IPV4,
    ipv6: IPV6,
    summary: `Adresse publique : IPv4 ${IPV4}, IPv6 ${IPV6}.`,
  });
  net.public.ipv6 = '';
  const without = await runScene(gladys, SCENE_ACTIONS.GET_PUBLIC_IP);
  assert.equal(without.ipv6, '');
  assert.match(without.summary, /IPv6 inconnue/);
});

test('widget: public address, records, button sending every name', async () => {
  const { gladys, net, clock } = await startApp({ config: { ...CONFIG, records: 'both' } });
  for (const language of ['en', 'fr', 'de', 'es']) {
    const { data } = await gladys.fake.widgetGet(WIDGETS.STATUS, { language });
    assert.deepEqual(validateWidgetContent(data.content), [], language);
  }
  const { data } = await gladys.fake.widgetGet(WIDGETS.STATUS, { language: 'en' });
  const status = data.content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value, item.color]),
    [
      ['Public IPv4', IPV4, 'primary'],
      ['Public IPv6', IPV6, 'primary'],
      [`${HOSTNAME} (A)`, 'Up to date', 'success'],
      [`${HOSTNAME} (AAAA)`, 'Up to date', 'success'],
    ],
  );
  clock.now += MIN_GAP_MS;
  const ack = await gladys.fake.widgetAction(WIDGETS.STATUS, WIDGET_ACTIONS.UPDATE);
  assert.equal(ack.success, true);
  assert.equal(ack.data.message.en, 'No-IP: 0 updated, 2 already right, 0 failed.');
  assert.equal(net.calls.length, 2);
});

test('without a name, or with names that are none: a message to fill the configuration', async () => {
  const { gladys, net } = await startApp({ config: {} });
  const { data } = await gladys.fake.widgetGet(WIDGETS.STATUS, { language: 'fr' });
  assert.match(data.content.components[0].text, /Aucun nom pour l’instant/);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en, /Enter your No-IP username/);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(net.echoes.length, 0);
  const invalid = await startApp({ config: { ...CONFIG, hostnames: 'bad!name' } });
  assert.equal(invalid.gladys.fake.connectionStatus.connected, false);
  assert.match(
    invalid.gladys.fake.connectionStatus.message.en,
    /Not a hostname or a group: bad!name/,
  );
});

test('test the connection: every name sent, one line per record', async () => {
  const { gladys, net, clock } = await startApp({ records: { [`${HOSTNAME}|ipv4`]: IPV4 } });
  assert.equal(net.calls.length, 0);
  clock.now += MIN_GAP_MS;
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(net.calls.length, 1, 'sent even though already right');
  assert.equal(ack.data.message.fr, `No-IP a accepté chaque nom :\n${HOSTNAME} (A) : déjà ${IPV4}`);
  await gladys.fake.configUpdated({ ...CONFIG, password: 'wrong' });
  clock.now += MIN_GAP_MS;
  const failed = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(
    failed.data.message.en,
    /Some names failed:\nhome\.ddns\.net \(A\): Username or password refused/,
  );
});

test('diagnostic: in the logs, password hidden', async () => {
  const lines = [];
  const gladys = createFakeGladys({ config: CONFIG });
  const net = fakeNet();
  createApp(gladys, {
    fetch: net,
    services: SERVICES,
    resolver: fakeResolver(net),
    storePath: storePath(),
    now: () => NOW,
    timers: false,
    logger: { ...silent, info: (line) => lines.push(line) },
  });
  await gladys.connect();
  const ack = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.equal(ack.success, true);
  const diagnostic = lines.filter((line) => line.startsWith('No-IP diagnostic')).join('');
  assert.match(diagnostic, /"password":"11 characters"/);
  assert.doesNotMatch(diagnostic, new RegExp(PASSWORD));
  assert.doesNotMatch(diagnostic, /fingerprint/);
});

test('devices: one per name, states republished when created', async () => {
  const { gladys } = await startApp({ config: { ...CONFIG, hostnames: `${HOSTNAME},cameras` } });
  const names = gladys.fake.discoveredDevices.map((device) => device.name);
  assert.deepEqual(names, [`${HOSTNAME} (No-IP)`, 'cameras (No-IP)']);
  assert.equal(gladys.fake.discoveredDevices[0].should_poll, false);
  assert.equal(gladys.fake.states.length, 0, 'nothing before the device exists');
  await createAll(gladys);
  assert.equal(gladys.fake.lastState(`${HOST}:ipv4`), IPV4);
  assert.equal(gladys.fake.lastState(`${HOST}:status`), 'À jour');
  assert.equal(gladys.fake.lastState(`${HOST}:changes`), 1);
  assert.ok(gladys.fake.widgetRefreshes.includes(WIDGETS.STATUS));
});

test('the store survives a broken file', async () => {
  const path = storePath();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, '{broken');
  const { net, path: kept } = await startApp({ path });
  assert.equal(net.calls.length, 1);
  assert.equal(JSON.parse(readFileSync(kept, 'utf8')).records[`${HOSTNAME}|ipv4`].ip, IPV4);
});
