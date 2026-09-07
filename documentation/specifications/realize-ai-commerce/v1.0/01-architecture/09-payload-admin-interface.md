# 9. Payload Admin interface

- **Статус:** target specification

## 9.1. Информационная архитектура

`/admin/ai` является рабочим пространством управления задачами, а drawer и
contextual actions — дополнительными точками входа. Все они используют один
server-side policy и Change Engine.

Основные разделы:

- Conversations и Runs;
- Change Requests, approvals и risk;
- implementation diff/checks и preview;
- source promotion, releases, deployments и rollback;
- audit, usage и operator escalation;
- Integrations;
- AI Settings.

## 9.2. AI Settings

Target route `/admin/ai/settings` содержит:

- Skills;
- Knowledge;
- Prompt templates;
- Local rules;
- Roles и capability bindings;
- Check bindings;
- Agent profiles;
- Workflows;
- Evals;
- Configuration releases.

Admin редактирует draft installation overlay, запускает validation/evals,
сравнивает diff конфигурации и отдельно активирует immutable release. Интерфейс
не редактирует `.ai/**`, `.codex/**`, license/security policy или protected
server registry.

Workflow редактируется как декларативная типизированная схема. Он может
ссылаться только на prompt templates, check bindings и зарегистрированные
server capabilities из того же configuration release. Произвольные JS/TS,
shell-команды, SQL и executable-код не являются содержимым installation
workflow. Обязательные policy, approval и execution gates добавляются Change
Engine независимо от локальной схемы workflow.

Текущее состояние: persistence и aggregate Config API уже реализованы, но сам
route `/admin/ai/settings` и его artifact editor ещё отсутствуют.

## 9.3. UX-инварианты

Для мутации UI показывает plan, scope, risk, стоимость, approvals, checks и
rollback strategy до исполнения. После исполнения — exact artifact, evidence,
preview и новое решение принятия. Disabled/blocked state должен объяснять
причину и не имитировать успех.
