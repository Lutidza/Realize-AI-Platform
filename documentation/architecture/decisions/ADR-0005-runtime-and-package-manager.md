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
  gate; текущий baseline выровнен на совместимые Next `16.3.1`, Payload `3.88.0`
  и React `19.2.8`.
