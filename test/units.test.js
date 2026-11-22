// The pure parts: configuration, answers of No-IP, echo services, the
// devices and the widget.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWidgetContent,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
} from '@gladysassistant/integration-sdk';

import {
  normalizeConfig,
  readName,
  readLanguage,
  DEFAULT_INTERVAL,
  DDNS_KEY_NAME,
  MAX_NAMES,
} from '../src/config.js';
import {
  parseAnswer,
  parseLine,
  createNoIpClient,
  ACCOUNT_KINDS,
  FATAL_KINDS,
  USER_AGENT,
} from '../src/noip-api.js';
import { readAddress, isPrivateIPv4, createAddressReader } from '../src/public-ip.js';
import {
  buildHostDevice,
  buildHostStates,
  parseHostId,
  hostStatus,
  recordStatus,
  STATUSES,
} from '../src/device.js';
import { buildStatusWidget, recordLabel, WIDGET_ACTIONS } from '../src/widgets.js';
import { ERRORS } from '../src/events.js';
import { LANGUAGES, t } from '../src/i18n.js';
import {
  fakeGladys,
  fakeNet,
  HOSTNAME,
  USERNAME,
  PASSWORD,
  IPV4,
  IPV6,
  NOW,
  TZ,
  NOIP,
} from './helpers/fixtures.js';

test('config: one account, names cleaned and sorted out, defaults', () => {
  assert.deepEqual(readName(' https://Home.ddns.net./path '), { name: HOSTNAME, kind: 'host' });
  assert.deepEqual(readName('Cameras'), { name: 'cameras', kind: 'group' });
  assert.deepEqual(readName('ALL.ddnskey.com'), { name: DDNS_KEY_NAME, kind: 'key' });
  for (const bad of ['a..b.com', '-x.ddns.net', '*.ddns.net', 'bad name!', '_x', 42]) {
    assert.equal(readName(bad), null, String(bad));
  }
  const config = normalizeConfig({
    username: ` ${USERNAME} `,
    password: PASSWORD,
    hostnames: `${HOSTNAME}, NAS.ddns.net;cameras  home.ddns.net, bad!`,
    records: 'both',
    interval: '60',
    language: 'de',
  });
  const both = ['ipv4', 'ipv6'];
  assert.deepEqual(config.account, { username: USERNAME, password: PASSWORD });
  assert.deepEqual(config.hosts, [
    { hostname: HOSTNAME, kind: 'host', families: both },
    { hostname: 'nas.ddns.net', kind: 'host', families: both },
    { hostname: 'cameras', kind: 'group', families: both },
  ]);
  assert.deepEqual(config.invalid, ['bad!']);
  assert.equal(config.interval, 60);
  assert.equal(config.language, 'de');
  assert.match(config.fingerprint, /^[0-9a-f]{64}$/);
  const empty = normalizeConfig();
  assert.deepEqual(
    { hosts: empty.hosts, interval: empty.interval, language: empty.language },
    { hosts: [], interval: DEFAULT_INTERVAL, language: 'auto' },
  );
  assert.deepEqual(
    normalizeConfig({ username: USERNAME, hostnames: HOSTNAME }).hosts,
    [],
    'no password',
  );
  const many = Array.from({ length: 15 }, (_, index) => `h${index}.ddns.net`).join(',');
  assert.equal(
    normalizeConfig({ username: USERNAME, password: PASSWORD, hostnames: many }).hosts.length,
    MAX_NAMES,
  );
  const base = { username: USERNAME, password: PASSWORD, hostnames: HOSTNAME };
  const print = (raw) => normalizeConfig(raw).fingerprint;
  assert.equal(print(base), print({ ...base, interval: '900', language: 'fr' }));
  assert.notEqual(print(base), print({ ...base, password: 'other' }));
  assert.notEqual(print(base), print({ ...base, records: 'both' }));
  assert.notEqual(print(base), print({ ...base, hostnames: `${HOSTNAME},cameras` }));
  assert.equal(normalizeConfig({ interval: '7' }).interval, DEFAULT_INTERVAL);
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'xyz' }, 'en'), 'en');
});

test('No-IP answers: one line per name, account codes thrown, statuses become kinds', () => {
  assert.deepEqual(parseLine(`good ${IPV4},${IPV6.toUpperCase()}`), {
    result: 'good',
    ipv4: IPV4,
    ipv6: IPV6,
  });
  assert.deepEqual(parseLine(`nochg ${IPV6}`), { result: 'nochg', ipv6: IPV6 });
  assert.deepEqual(parseLine('!donator'), { result: 'error', kind: 'donator', code: '!donator' });
  assert.deepEqual(parseAnswer(200, `good ${IPV4}\nnohost\n`, 2), [
    { result: 'good', ipv4: IPV4 },
    { result: 'error', kind: 'nohost', code: 'nohost' },
  ]);
  const kind = (status, body, count = 1) => {
    try {
      parseAnswer(status, body, count);
    } catch (err) {
      return err.kind;
    }
    return 'success';
  };
  assert.equal(kind(401, 'badauth'), 'auth');
  assert.equal(kind(401, ''), 'auth');
  assert.equal(kind(200, 'badauth', 2), 'auth', 'once for the whole request');
  assert.equal(kind(200, 'abuse', 3), 'abuse');
  assert.equal(kind(200, 'badagent', 2), 'badagent');
  assert.equal(kind(200, '911', 2), 'server');
  assert.equal(kind(200, 'nohost', 2), 'server', 'a line missing');
  assert.equal(kind(429, 'Too many requests'), 'server');
  assert.equal(kind(502, '<html>Bad gateway</html>'), 'server');
  assert.equal(kind(500, `good ${IPV4}`), 'server', 'a success needs a 2xx');
  assert.equal(kind(200, ''), 'server');
  assert.deepEqual(ACCOUNT_KINDS, ['auth', 'badagent', 'donator', 'abuse']);
  assert.deepEqual(FATAL_KINDS, [...ACCOUNT_KINDS, 'nohost']);
});

test('No-IP client: Basic authorization, the User-Agent No-IP asks for, one request', async () => {
  const net = fakeNet();
  const client = createNoIpClient({ fetch: net });
  assert.deepEqual(
    await client.update({ username: USERNAME, password: PASSWORD }, [HOSTNAME, 'cameras'], {
      ipv4: IPV4,
      ipv6: IPV6,
    }),
    [
      { result: 'good', ipv4: IPV4, ipv6: IPV6 },
      { result: 'good', ipv4: IPV4, ipv6: IPV6 },
    ],
  );
  assert.deepEqual(net.calls[0].names, [HOSTNAME, 'cameras']);
  assert.equal(net.calls[0].myip, `${IPV4},${IPV6}`);
  assert.equal(net.calls[0].username, USERNAME);
  assert.equal(net.calls[0].agent, USER_AGENT);
  assert.match(USER_AGENT, /^Gladys-Assistant gladys-no-ip\/\d+\.\d+\.\d+ https:\/\/github\.com\//);
  assert.equal(client.requests, 1);
  const urls = [];
  await createNoIpClient({
    fetch: async (url) => {
      urls.push(url);
      return new Response(`nochg 1.2.3.4\nnochg 1.2.3.4`);
    },
  }).update({ username: USERNAME, password: PASSWORD }, [HOSTNAME, 'all.ddnskey.com'], {
    ipv4: '1.2.3.4',
    ipv6: '2001:db8::1',
  });
  assert.equal(urls[0], `${NOIP}?hostname=${HOSTNAME},all.ddnskey.com&myip=1.2.3.4,2001:db8::1`);
  await assert.rejects(
    createNoIpClient({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    }).update({ username: USERNAME, password: PASSWORD }, [HOSTNAME], { ipv4: '1.2.3.4' }),
    (err) => err.kind === 'network' && !err.message.includes(PASSWORD),
  );
});

test('echo services: only a public address of the asked family is kept', async () => {
  assert.equal(readAddress('ipv4', ` ${IPV4}\n`), IPV4);
  assert.equal(readAddress('ipv4', IPV6), '');
  assert.equal(readAddress('ipv6', IPV4), '');
  assert.equal(readAddress('ipv6', '2001:DB8::1'), '2001:db8::1');
  assert.equal(readAddress('ipv4', '<html>blocked</html>'), '');
  for (const ip of ['10.0.0.1', '192.168.1.10', '172.20.0.2', '100.64.1.1', '127.0.0.1']) {
    assert.ok(isPrivateIPv4(ip), ip);
    assert.equal(readAddress('ipv4', ip), '', ip);
  }
  assert.equal(isPrivateIPv4('172.32.0.1'), false);
  for (const ip of ['::1', 'fe80::1', 'fd00::1', '::ffff:1.2.3.4']) {
    assert.equal(readAddress('ipv6', ip), '', ip);
  }
  const reader = createAddressReader({
    fetch: async () => new Response('nope', { status: 500 }),
    services: { ipv4: ['https://a.example', 'https://b.example'], ipv6: [] },
    resolver: { resolve4: async () => [IPV4], resolve6: async () => [] },
  });
  await assert.rejects(
    reader.publicAddress('ipv4'),
    (err) => err.kind === 'no_ip' && /a\.example: 500, b\.example: 500/.test(err.message),
  );
  await assert.rejects(reader.publicAddress('ipv6'), (err) => err.kind === 'no_ip');
  assert.equal(await reader.resolve(HOSTNAME, 'ipv4'), IPV4);
  assert.equal(await reader.resolve(HOSTNAME, 'ipv6'), '');
});

test('devices: valid features, the right category / type pairs, in every language', () => {
  for (const language of LANGUAGES) {
    for (const families of [['ipv4'], ['ipv6'], ['ipv4', 'ipv6']]) {
      const device = buildHostDevice(fakeGladys, { hostname: HOSTNAME, families }, language);
      assert.equal(device.should_poll, false);
      assert.equal(device.poll_frequency, undefined);
      assert.equal(device.features.length, families.length + 2);
      for (const feature of device.features) {
        for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
          assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
        }
        assert.ok(feature.name.length > 0 && feature.name.length <= 50);
        assert.equal(feature.read_only, true);
      }
      const pairs = device.features.map((feature) => [feature.category, feature.type]);
      assert.deepEqual(pairs.at(-1), [
        DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      ]);
      for (const pair of pairs.slice(0, -1)) {
        assert.deepEqual(pair, [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT]);
      }
    }
  }
  assert.equal(parseHostId(`ext:x:host:${HOSTNAME}`), HOSTNAME);
  assert.equal(parseHostId(`ext:x:host:${HOSTNAME}:status`), HOSTNAME);
  assert.equal(parseHostId('ext:x:other:1'), '');
});

test('device states: confirmed addresses only, the worst status, the sum of changes', () => {
  const records = {
    [`${HOSTNAME}|ipv4`]: { ip: IPV4, changes: 2, error: '' },
    [`${HOSTNAME}|ipv6`]: { ip: '', changes: 0, error: 'nohost' },
  };
  const states = buildHostStates(
    fakeGladys,
    { hostname: HOSTNAME, families: ['ipv4', 'ipv6'] },
    (hostname, family) => records[`${hostname}|${family}`],
    'en',
  );
  assert.deepEqual(
    states.map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.text ?? state.state,
    ]),
    [
      ['ipv4', IPV4],
      ['status', 'Name unknown to this account'],
      ['changes', 2],
    ],
  );
  assert.equal(hostStatus([{ ip: IPV4 }, { ip: '' }]), 'pending');
  assert.equal(hostStatus([{ ip: IPV4 }]), 'ok');
  assert.equal(recordStatus({ ip: IPV4, error: 'weird' }), 'ok');
  assert.deepEqual(ERRORS, STATUSES.slice(2));
});

test('statuses fit a widget value (40 characters) in every language', () => {
  for (const language of LANGUAGES) {
    for (const status of STATUSES) {
      const text = t(`status_${status}`, language);
      assert.ok(text.length <= 40, `status_${status}.${language}: ${text.length}`);
    }
    for (const status of STATUSES) {
      const text = t(`short_${status}`, language);
      assert.ok(text.length <= 16, `short_${status}.${language}: ${text.length}`);
    }
    for (const key of ['buttonUpdate', 'rowPublicIpv4', 'rowPublicIpv6']) {
      assert.ok(t(key, language).length <= 24, `${key}.${language}`);
    }
    assert.ok(t('widgetHeading', language).length <= 40);
    assert.ok(t('checkedAt', language, { time: '23:59' }).length <= 80);
  }
});

test('widget: valid in every language, long names cut before the record type', () => {
  const hosts = [
    { hostname: HOSTNAME, families: ['ipv4', 'ipv6'] },
    { hostname: 'a-very-long-sub-domain-name.of-a-domain.ddns.net', families: ['ipv4'] },
    { hostname: 'nas.ddns.net', families: ['ipv4'] },
  ];
  const records = {
    [`${HOSTNAME}|ipv4`]: { ip: IPV4 },
    [`${HOSTNAME}|ipv6`]: { ip: '', error: 'auth' },
    'nas.ddns.net|ipv4': { ip: '' },
  };
  for (const language of LANGUAGES) {
    const content = buildStatusWidget({
      hosts,
      publicIps: { ipv4: { ip: IPV4 }, ipv6: { error: 'no_ip' } },
      recordOf: (hostname, family) => records[`${hostname}|${family}`] ?? { ip: IPV4 },
      checkedAt: NOW,
      language,
      timeZone: TZ,
    });
    assert.deepEqual(validateWidgetContent(content), [], language);
    const status = content.components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 6);
    assert.deepEqual(
      status.items.map((item) => item.color),
      ['primary', 'danger', 'success', 'danger', 'success', 'warning'],
    );
    assert.equal(content.components.at(-1).text, t('checkedAt', language, { time: '11:00' }));
    assert.equal(content.components[2].action.key, WIDGET_ACTIONS.UPDATE);
  }
  const label = recordLabel('a-very-long-sub-domain-name.of-a-domain.ddns.net', 'ipv6');
  assert.equal(label.length, 40);
  assert.match(label, /… \(AAAA\)$/);
  const empty = buildStatusWidget({
    hosts: [],
    publicIps: {},
    recordOf: () => ({}),
    checkedAt: 0,
    language: 'en',
  });
  assert.deepEqual(validateWidgetContent(empty), []);
  const unchecked = buildStatusWidget({
    hosts: [hosts[2]],
    publicIps: {},
    recordOf: () => ({ ip: '' }),
    checkedAt: 0,
    language: 'fr',
  });
  assert.equal(unchecked.components.at(-1).text, 'Pas encore vérifié · No-IP');
});
