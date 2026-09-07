---
name: skill-documentation-sync
description: Синхронизирует изменённые docs, правила .ai и адаптеры .codex; применяется при изменении документации или их контрактов.
---

# Синхронизация документации и инструкций

Открой изменяемый artifact и его непосредственные ссылки/consumers. Активный
контракт:
`.ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md`.

- Правило поведения меняй в `.ai/rules/**`; критерий проверки — в `.ai/checks/**`;
  порядок — в workflow; исполняемую процедуру Codex — в `.codex/**`.
- Обнови только registry, роли, prompts и skills, чьи ссылки/смысл изменились.
  Не копируй полный текст правила в эти adapters.
- Product/architecture contract синхронизируй в ближайшем `documentation/**`.
  Текущие инструкции AI-layer сами являются своим canonical source.
- При rename/delete проверь конкретные старые ссылки по
  `.ai/checks/self-review/CHECK-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md`.
- Для skills проверь frontmatter и существующий `agents/openai.yaml`.
  Для docs достаточно diff и ссылок; app test/build/browser нужны только
  если изменилось соответствующее исполняемое поведение.

Явный запрос на оптимизацию разрешает правки в указанном scope; отдельные
observation/proposal/applied записи и повторное согласование не требуются.
Сохрани один отчёт лишь если нужен результат аудита или объяснение существенного
решения. Исторические документы не превращай в активные инструкции.
