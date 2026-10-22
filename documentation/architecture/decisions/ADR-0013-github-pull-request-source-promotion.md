# ADR-0013: GitHub Pull Request source promotion

## Status

accepted

## Context

После принятия exact local preview service commit существует только в
изолированном worker worktree. Для обычного code-review его нужно перенести в
GitHub, не применяя diff к основному checkout, не публикуя в `main` и не выдавая
агенту merge или production authority.

`ReleaseCandidate` из ADR-0010 решает другую задачу: он связывает commit с OCI
artifact, signature, migrations и remote preview. Использование этого aggregate
для Pull Request смешало бы source-control review с release approval и сделало
бы независимые lanes неявными.

## Decision

- source-control публикация хранится в отдельном durable `SourcePromotion`
  aggregate и запускается только для hash-bound `PREVIEW_ACCEPTANCE` и exact
  service commit;
- authenticated Payload endpoint принимает optimistic-lock поля
  `expectedVersion`, `expectedGitCommit` и `expectedPreviewArtifactHash`, но не
  branch, repository, token или Pull Request payload;
- endpoint только создаёт PostgreSQL job. Git и GitHub network side effects
  выполняет отдельный execution worker;
- job сохраняет immutable source hashes, repository, default branch и revision
  проверенной GitHub integration. Перед side effect worker повторно проверяет
  preview/acceptance binding и неизменность integration destination;
- head branch выводится детерминированно как
  `ai/changes/<change-id>-<promotion-key-prefix>`. Worker публикует только exact
  commit и блокирует существующий ref на другом commit. Создание новой ветки
  использует общий `@realize/git-runtime` и атомарное условие отсутствия ref:
  `--force-with-lease=<exact-ref>:` с пустым expected value. Это create-only CAS:
  ветка, появившаяся после предварительного чтения, не обновляется даже при
  возможности fast-forward. Безусловный `--force` и перезапись существующей
  ветки запрещены; тот же уже опубликованный commit допускает безопасный retry;
- GitHub credential расшифровывается только в worker. Для Git он передаётся
  через временный `GIT_ASKPASS`, а не command arguments, logs, DTO или Payload
  record;
- GitHub REST adapter сначала ищет Pull Request по exact head/base. Если его
  нет, создаётся только open draft Pull Request с
  `maintainer_can_modify: false`; другой head SHA, base, state или draft mode
  блокирует result;
- успешный result связывается с repository, branches, exact commit, Pull Request
  number/URL/state и исходными preview hashes отдельным evidence hash. Browser
  получает только redacted DTO;
- повтор `failed`/`blocked` job разрешён только после полной повторной проверки
  того же source/destination binding. Уже опубликованный exact ref и draft PR
  переиспользуются идемпотентно;
- source promotion не изменяет основной checkout, `main`, Change Request diff,
  release approval или production. Merge остаётся внешним человеческим
  действием GitHub;
- `SourcePromotion` и `ReleaseCandidate` являются независимыми downstream lanes
  одного принятого preview и могут выполняться в любом порядке.

## Consequences

- GitHub token должен быть repository-scoped и иметь минимально необходимые
  `contents:write` и `pull_requests:write`; workflow permissions нужны только
  отдельному release adapter-у;
- read-only connection test подтверждает repository identity и ref write access,
  а фактическое право создавать Pull Request проверяется fail-closed при первой
  source promotion;
- branch может остаться после ошибки Pull Request API; безопасный retry найдёт
  только тот же exact commit и не перепишет ref;
- удаление branch, закрытие/merge Pull Request и cleanup remote artifacts не
  входят в этот slice и требуют отдельного lifecycle решения;
- реальный push/PR требует operator configuration и не является частью
  локальных тестов или миграционной проверки.
