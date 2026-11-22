# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for No-IP (dynamic DNS): a
Node.js service (Node 22+, ESM, no build step) that runs in its own sandboxed
Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It keeps up to ten No-IP names (hostnames,
groups, or `all.ddnskey.com` for a DDNS Key) pointed at the public address of
the home through the official update endpoint
(`GET https://dynupdate.no-ip.com/nic/update?hostname=a,b&myip=<ipv4>,<ipv6>`,
Basic authentication with the account or DDNS Key, one answer line per name:
`good` / `nochg` / `nohost` / `badauth` (HTTP 401) / `badagent` / `!donator` /
`abuse` / `911`; https://www.noip.com/integrate/request and /response). The
public address is read on echo services (ipify, icanhazip, ident.me, an
A-only and an AAAA-only name per family). Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timer, the check, the stops, the scene actions
src/noip-api.js         the No-IP endpoint: Basic auth, User-Agent, one line per name -> results or err.kind
src/public-ip.js        public address on echo services (fallbacks, private ranges refused), DNS resolution
src/device.js           one device per name and its states; record and host statuses
src/events.js           scene trigger keys and data, scene action outputs
src/widgets.js          the status dashboard widget
src/store.js            /data/noip.json: `public`, `records`, `account`
src/config.js           configuration (username, password, hostnames, records, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`host:<name>`, the hostname, group or
  `all.ddnskey.com` in lowercase, never its place in the list), feature
  `category` / `type` / `unit` / `min` / `max` / `step`, the keys of `config_schema` and their option values, `actions`, the widget,
  scene triggers (fields, options, variables) and scene actions (fields,
  outputs), and the internal config key `last_language`.
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** Addresses and status are `text` / `text`; the
  number of changes is `counter-sensor` / `integer`. An address No-IP has
  not confirmed is never published.
- **`should_poll` stays false**: the integration checks on its own timer
  (`interval`, 1 to 30 min, 5 by default).
- **Follow the client rules of No-IP** (https://www.noip.com/integrate):
  it blocks clients that collect `nochg` answers or keep sending after an
  error. Every name due goes in one request; a name is sent only when the
  public address differs from the one No-IP last confirmed (a hostname already
  right in the DNS is adopted without a call; groups and DDNS Keys are no DNS
  names), or a hostname still resolves elsewhere 15 min after (`DRIFT_MS`),
  at most every 6 h (`DRIFT_RETRY_MS`); never two requests within
  `MIN_GAP_MS` (1 min), whoever asks. An error answer (`FATAL_KINDS`) stops
  the account or the name, persisted in /data, until the settings change
  (`fingerprint` of `normalizeConfig`) or a person presses "Test the
  connection" / the widget button (`human`); a scene never lifts a stop, and
  forces a name at most once an hour (`SCENE_FORCE_GAP_MS`). After a `911` or
  an HTTP 5xx, nothing for 30 min (`SERVER_RETRY_MS`), even for a person.
- **The password is a secret.** Never log it (the diagnostic shows its
  length), never put it in an error message, a URL, a widget or `/data`; the
  settings fingerprint derives from it and lives in memory only.
- **Events once.** `public` (in /data) keeps the last public address per
  family: the first reading is a baseline, a restart never fires the same
  change twice. `update_failed` fires on a transition to an error, not at
  every check. A scene action fires nothing (no loops) and leaves `public`
  untouched, so the next check still fires the change it saw.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Statuses are widget values: 40
  characters at most, the short ones 16.
- **Widget images.** After any change to the content of the widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files. They
  use documentation addresses only (203.0.113.0/24, 2001:db8::/32).
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.3.0` (widgets, scene triggers, catalog
  `keywords`). Transport: `["cloud"]`. No permission. One secret
  (`password`), no `countries` (No-IP is worldwide).
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (`test/helpers/fixtures.js`: a
  fake network answering like No-IP and the echo services, a fake
  resolver).
