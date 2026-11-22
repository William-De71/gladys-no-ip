# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-22

### Added

- Dynamic DNS with No-IP: up to ten hostnames, groups or `all.ddnskey.com` (every hostname of a DDNS Key) kept pointed at the public address of the home through the official No-IP update endpoint, IPv4, IPv6 or both sent together in one request.
- The public address read on echo services (ipify, icanhazip, ident.me, the next one when one fails) every 1 to 30 minutes, 5 by default; No-IP is only called when a name must change, a hostname already right is adopted without a call, and a hostname resolving elsewhere is sent again at most every 6 hours.
- The client rules of No-IP: never two requests within a minute, every error answer stops the updates until the settings change (kept across restarts), and nothing is sent for 30 minutes after a No-IP failure.
- One device per name: IPv4 and IPv6 addresses confirmed by No-IP, status in words and the number of address changes.
- Scene triggers: public address changed, record updated, update failed (once per error, filtered by name, address type and error).
- Scene actions: update now (one name or all, optionally forced at most once an hour), and read the public address to send it in a message.
- Dashboard widget: the public IPv4 / IPv6 and every name with its status, and a button to update now.
- Configuration actions: test the connection (every name sent to No-IP, a stop lifted), and a diagnostic written to the Logs tab (password hidden).
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-no-ip/releases/tag/v0.1.0
