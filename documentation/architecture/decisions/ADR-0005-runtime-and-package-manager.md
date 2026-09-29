# ADR-0005: Runtime and package manager

## Status

accepted

## Context

В корне используется npm lockfile, а Playwright ошибочно запускает `pnpm dev`. Runtime до решения не был закреплён одинаково для local, Docker и CI.

## Decision

- canonical package manager: npm;
- canonical runtime line: Node.js 24 LTS;
- reproducible baseline: Node.js `24.18.0` и bundled npm `11.15.0`;
- `.nvmrc`, `.node-version`, `package.json`, Docker и CI используют одну версию;
- patch upgrade выполняется отдельным maintenance change после CI evidence;
- nested tool projects имеют собственную boundary и не входят в root install.

## Evidence

Node.js `24.18.0` является официальным LTS release и имеет официальный `node:24.18.0-bookworm-slim` image. Release включает npm `11.15.0`.

## Consequences

- root commands используют только npm;
- CI явно проверяет Node/npm до install;
- локальная среда с другой patch/version получает понятную ошибку runtime check;
- dependency upgrades выполняются только отдельным evidence-backed security
  gate; текущий baseline выровнен на совместимые Next `16.3.7`, Payload `3.88.0`
  и React `19.2.8`.

Next и его env/ESLint packages используют линию `16.3.7`; image processing —
sharp `0.35.5`. Эти версии включают исправления безопасности и поддерживают
закреплённый Node.js. Точные транзитивные версии принадлежат `package-lock.json`.

Root override закрепляет `undici` на `7.29.1` для Payload и jsdom: Payload
`3.88.0` требует уязвимую `7.29.0`, а
[официальный patch release](https://github.com/nodejs/undici/releases/tag/v7.29.1)
закрывает security advisories в той же minor-линии. При обновлении Payload
нужно повторно проверить необходимость override; установка и CI не используют
`--force` или `--legacy-peer-deps`.
