# 26. CI/CD pipeline

- **Статус:** target specification
- **Current baseline:** GitHub Actions, GHCR и exact-digest deployment уже присутствуют

Реализация находится в `.github/workflows/ci.yml`, `release.yml` и
`reusable-deploy.yml`; фактические возможности и ограничения описаны в
[delivery runbook](../../../../delivery/02-ci-release-deploy.md).
Наличие этих workflows не означает готовность двух продуктовых Git-интеграций,
настроенных правил защиты репозитория или approval-bound production controller.

## 26.1. Source gates

Pull Request выполняет runtime verification, formatting, lint, typecheck,
integration tests, build, migration checks, security/dependency scan и
profile-specific tests по scope. Generated artifacts и dirty diff после
проверок запрещены.

## 26.2. Release candidate

Release строится из exact commit в trusted CI:

1. reproducible application image;
2. SBOM и provenance;
3. vulnerability policy;
4. signature verification;
5. manifest/migration/config compatibility hashes;
   manifest охватывает версии ядра, профилей, схемы, API и системного AI-слоя;
6. immutable registry digest;
7. production-like release preview и health evidence.

Candidate identity не выводится из mutable tag.

## 26.3. Promotion

Staging и production используют один digest. Production требует environment
approval и отдельный Realize `PRODUCTION_AUTHORIZATION` exact candidate.
CI credential, worker credential и deploy credential разделены.

## 26.4. Rollback

Workflow хранит previous known-good digest и release metadata. Failed readiness
возвращает application digest, но не выполняет автоматический database restore.
Rollback evidence и operator action входят в audit.

## 26.5. Приёмка версий и обновлений

Release связан с [manifest платформы](../01-architecture/40-platform-versioning-and-updates.md)
и поддерживаемыми переходами с предыдущих клиентских версий. CI проверяет
применимые контракты, миграции, локальные расширения и несовместимые комбинации.
До первой распространяемой версии выполняется upgrade drill между двумя
candidate releases с сохранением данных и проверенным восстановлением.

Изменения system release, model/adapter или routing policy проходят профильные
evals с evidence качества, задержки и стоимости. Release channel не обходит
эти проверки и не превращает обновление клиентского проекта в безусловный deploy.

## 26.6. Два назначения CI/CD

Границы репозиториев и подключений задаёт
[контракт версионирования](../01-architecture/40-platform-versioning-and-updates.md).

| Этап       | Платформа                                                                         | Клиентский проект                                                                              |
| ---------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Изменение  | PR в основной репозиторий; review владельцев затронутого ядра и workflows         | PR в репозиторий конкретного проекта; review по его правам и риску                             |
| Проверки   | Контракты ядра/AI, профильные tests, безопасность, совместимость и evals по scope | Обязательные проверки платформы и дополнительные проверки сайта, локальных расширений и данных |
| Сборка     | Exact commit, воспроизводимый candidate, SBOM, provenance, подпись и manifest     | Exact project commit, проверенная версия ядра, project artifact и собственный manifest         |
| Публикация | Immutable выпуск и release channel для поддерживаемых клиентов                    | Preview/staging проекта и acceptance evidence                                                  |
| Production | Отдельная доставка центрального сервиса с разрешением на его candidate            | Разрешение на candidate конкретной установки, rollout, health и recovery                       |

В основном репозитории обязательные checks и review защищают целевую ветку;
изменения ядра, правил выпуска и workflows имеют явных владельцев. Candidate
публикуется только из проверенного exact commit доверенным процессом. Публикация
клиентского пакета/образа и развёртывание центрального AI-сервиса — отдельные
действия, даже если их инициирует один выпуск платформы.

В клиентском репозитории обычная доработка, AI Source Promotion и обновление
ядра проходят один применимый путь PR → checks → preview → acceptance → release.
Существующий draft PR flow развивается у своего владельца. Commit/push не
означает разрешение на merge или production rollout. Выпуск платформы создаёт
возможность отдельного обновления клиента и не запускает deploy всей базы сайтов.

## 26.7. Изоляция и полномочия pipeline

Job permissions минимальны и заданы явно; PR с недоверенным кодом выполняется
без publish/deploy credentials. Actions и reusable workflows закреплены
полным commit SHA, их обновления проходят review. Изменения `.github/workflows`
требуют назначенных reviewers. Где поддерживается, используются короткие
workload credentials вместо постоянного ключа. Production environment имеет
явные правила допуска к секретам и подтверждения запуска. Это основано на
[рекомендациях GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

Для платформы и клиентов разделяются identities, секреты, права registry,
окружения и исполнение. Недоверенная сборка не получает host Docker socket
или доступ к предыдущему workspace. Runners изолированы и очищаются после
задачи; caches и artifacts не пересекают границы клиентов и уровни доверия.
Привилегированный job не исполняет код или команды из PR/evidence без проверки.

Build, публикация, приёмка и deploy используют разные полномочия. Credential
одного клиентского проекта не позволяет записать результат другого или
опубликовать системный release. Перезапуск/таймаут не создаёт второй rollout:
delivery owner сохраняет состояние и выясняет результат предыдущей попытки.
Само появление workflow-файла не доказывает настройку GitHub protections;
приёмка включает фактические repository/environment settings и попытку обхода.

## 26.8. Доверие к checks и артефактам

Обязательный check pack и контракт pipeline версионируются владельцем платформы.
Клиент может расширять собственный CI; ослабленная копия workflow не заменяет
обязательные проверки управляемого platform delivery. Непроверенный зелёный
статус, имя job или переданный клиентом JSON не являются acceptance evidence.

Центральный verifier проверяет repository identity, exact source commit,
workflow/check-pack version, доверенного исполнителя, результат и artifact
digest. Подпись/provenance проверяются относительно разрешённого issuer и
builder identity. Изменение workflow, inputs, commit или artifact делает
несоответствующее evidence неприменимым. Проверки, которые нельзя достоверно
подтвердить во внешнем CI, исполняются на контролируемом платформой runner.

Клиент сохраняет возможность самостоятельно менять и развёртывать свой сайт.
Внешние действия не получают статус проверенного выпуска платформы без
соответствующего evidence и не изменяют policy центрального AI-сервиса.

## 26.9. Поэтапная реализация

Используются существующие GitHub Actions/GHCR и delivery owners. Сначала
фиксируются identity, права, версии и manifest; затем разделяются подключения
и развиваются pipeline платформы и клиента. Набор gates расширяется вместе
с готовностью metering, evals, моделей и обновлений, без декларации отсутствующих
проверок как выполненных.

Порядок и приёмка — [GIT-01–GIT-06](../06-execution-governance/32-immediate-implementation-order.md).
До первого внешнего пилота проверяются оба назначения, отказ при подмене
credentials/evidence и upstream upgrade с локальными доработками. Конкретный
способ авторизации Git provider выбирается отдельным ADR; он не отменяет
разделения владельцев и минимальных полномочий.
