# 6. Целевая архитектура

- **Статус:** target specification

## 6.1. Плоскости системы

1. **Site runtime** — public site, Payload Local/API, PostgreSQL, media и
   профильные модули.
2. **Admin/control interface** — обычный Payload Admin, `/admin/ai`,
   contextual actions, integrations и AI settings.
3. **Installation configuration plane** — drafts/releases локальных skills,
   knowledge, prompts, rules, roles, checks, agents и evals.
4. **AI control plane** — identity resolution, Context Pack compiler,
   orchestration, policy, Change Engine, events, audit и usage.
5. **Execution plane** — изолированные data/schema/code executors, workspaces,
   checks, preview и artifact verification.
6. **Build/release plane** — source promotion, OCI build, signing, deployment,
   health verification и rollback.
7. **Commercial/operator plane** — installation identity, license,
   subscriptions, metering, fleet operations и escalation.

Чат является одним client interface к control plane. Те же policy и state
machine обязательны для contextual actions, API automation и scheduled tasks.

## 6.2. Основной поток

```text
actor request
→ authenticated installation/actor context
→ protected context compilation
→ intent and capability planning
→ Change Request
→ policy/risk/check plan
→ required approval
→ isolated execution
→ evidence and preview
→ result acceptance
→ release/production approval when applicable
→ delivery and audit
```

Ни один downstream переход не наследует authority автоматически. Exact hashes,
версии и optimistic locks проверяются повторно перед side effect.

## 6.3. Изоляция

Инсталляция видит только собственные данные и конфигурацию. Worker получает
short-lived capability с operation, scope, actor, installation, expiry и
allowed tool set. Central services хранят минимальные метаданные и не становятся
общей CMS-базой.

## 6.4. Доступность

Site runtime продолжает обслуживать публичные read-сценарии при временной
недоступности AI или commercial control plane. AI mutation и новый production
transition в неопределённом состоянии прекращаются fail-closed.
