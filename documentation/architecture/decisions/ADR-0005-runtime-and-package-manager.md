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
- dependency upgrades требуют свежих release/registry evidence, совместимости и изолированных проверок; изменение source и lock не подтверждает установленную систему.

## Dependency maintenance decision — 2026-10-13

При объединении `test/search-acceptance` сохраняются имя `realize-ai-platform`, все текущие Git/runtime scripts и workspace packages из `main`. Изменения зависимостей сначала применяются к отдельному candidate source snapshot. Payload `3.88.0`, React `19.2.8`, TypeScript `6.0.3`, Node `24.18.0` и npm `11.15.0` сохраняются. Upgrade Payload выходит за этот scope: текущая установка и `scripts/runtime/patches/@payloadcms+ui+3.88.0.patch` относятся к `3.88.0`.

Version evidence проверено 13 октября 2026 через официальные release pages и npm registry queries.

| Dependency                                                            | Latest stable | Selected | Decision и совместимость                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `next`, `@next/env`, `@next/eslint-plugin-next`, `eslint-config-next` | `16.4.0`      | `16.4.0` | `latest_compatible`: Node ≥20.9 и React18.2/19; `@payloadcms/next@3.88.0` допускает Next ≥16.2.6 <17; ESLint9/TypeScript6 удовлетворяют lint peers.                                                                                  |
| `sharp`                                                               | `0.35.5`      | `0.35.5` | `latest_compatible`: Node ≥20.9.                                                                                                                                                                                                     |
| `undici`                                                              | `8.11.2`      | `7.30.0` | `pinned_for_compatibility`: Payload3.88 объявляет `7.29.0`, jsdom29.1.1 — `^7.25.0`; major8 не соответствует parent contracts. Выбрана актуальная API line7, Node ≥20.18.1. Override принимается после изолированных runtime checks. |

Официальные источники: [Next16.4](https://nextjs.org/blog/next-16-4), [Next16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16), [sharp0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5), [Undici7.30.0](https://github.com/nodejs/undici/releases/tag/v7.30.0) и [Undici8.0 major release](https://github.com/nodejs/undici/releases/tag/v8.0.0). Registry contract подтверждён командами `npm view <package> version dist-tags engines peerDependencies --json`, `npm view @payloadcms/next@3.88.0 version engines peerDependencies --json`, `npm view payload@3.88.0 version engines dependencies.undici --json` и `npm view jsdom@29.1.1 version engines dependencies.undici --json`.

Транзитивные patches входящей ветки сохраняются в допустимых parent ranges: `brace-expansion` `1.1.21` и `5.0.12` (minimatch `^1.1.7`/`^5.0.8`), `fast-uri` `3.1.8` (Payload AJV `^3.0.1`), `js-yaml` `4.3.2` (parser/ESLint `^4.1.0`/`^4.3.0`), вложенный Payload `@next/env` `15.5.27` (`^15.1.5`). Latest `fast-uri4.2.2` и `js-yaml5.4.3` не соответствуют текущим parent major constraints. Источники — [fast-uri releases](https://github.com/fastify/fast-uri/releases), [js-yaml releases](https://github.com/nodeca/js-yaml/releases), [brace-expansion releases](https://github.com/juliangruber/brace-expansion/releases) и актуальные npm registry queries для stable и выбранных major lines.

Lock принадлежит `package-lock.json`: он регенерируется штатным npm из merged manifest и текущего main lock, с ограниченным обновлением названных транзитивных families. Все workspace packages сохраняются, UI-kit остаётся `0.2.0`. Не использовать `--force` или `--legacy-peer-deps`. Root override `undici7.30.0` пересматривается при будущей синхронизации Payload; он не разрешает major upgrade или обновление несвязанных dependencies.

До приёмки нужны отдельные `npm ci`, audit, static/integration/build и browser checks с собственными dependencies, одноразовой БД и server. Browser tests изменяют primary integration singleton только в этой isolated installation. Датированный version decision и lock не доказывают deployment, запуск приложения или изменения рабочей БД.
