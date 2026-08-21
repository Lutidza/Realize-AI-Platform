# 7. Declarative-first: основа масштабируемого продукта

## 7.1. Почему нельзя строить продукт только на генерации кода

Если каждый пользовательский запрос приводит к произвольному изменению TypeScript/React-кода, платформа быстро получает:

- сотни несовместимых форков;
- сложные обновления ядра;
- растущий риск сборки;
- дорогие preview и тесты;
- слабую предсказуемость;
- высокий расход токенов;
- сложный rollback;
- невозможность поддерживать 1 000 клиентов небольшой командой.

Поэтому целевая доля изменений:

- 70–80% — декларативная конфигурация и данные;
- 15–25% — site-level extension code;
- не более 5% — изменение platform core через отдельный инженерный процесс.

## 7.2. Module Registry

Необходимо создать машинно читаемый реестр готовых модулей.

Каждый модуль обязан иметь:

```ts
interface RealizeModuleDefinition {
  id: string
  version: string
  title: string
  description: string
  category: 'content' | 'commerce' | 'marketing' | 'navigation' | 'forms' | 'design'
  configSchema: JSONSchema
  defaultConfig: Record<string, unknown>
  capabilities: string[]
  allowedSlots: string[]
  dependencies: string[]
  conflicts: string[]
  migrations?: ModuleMigration[]
  previewComponent: string
  adminComponent?: string
  aiInstructions: {
    useWhen: string[]
    doNotUseWhen: string[]
    examples: Array<{ request: string; config: unknown }>
  }
}
```

Примеры модулей:

- carousel;
- product grid;
- category tabs;
- hero;
- banner;
- lead form;
- newsletter form;
- reviews;
- delivery information;
- comparison table;
- related products;
- SEO landing block;
- cart summary.

## 7.3. Theme Contract

Визуальные изменения должны по возможности выполняться через versioned design tokens:

- typography;
- colors;
- spacing;
- radii;
- shadows;
- container widths;
- breakpoints;
- card density;
- button variants;
- image ratios.

Агент должен менять theme config до того, как создаёт локальный CSS.

## 7.4. Extension points

Core должен предоставлять устойчивые extension points:

- custom blocks;
- product card slots;
- checkout side panels;
- header/footer regions;
- collection hooks;
- custom fields;
- domain services;
- feature flags;
- admin widgets.

Site-level код добавляется только через extension points, а не через копирование core-компонентов.

## 7.5. Три уровня изменений

### Level A — Site Configuration

Разрешено владельцу магазина при наличии прав:

- тексты;
- изображения;
- страницы;
- товары;
- категории;
- блоки;
- порядок модулей;
- theme tokens;
- feature flags;
- безопасные настройки модулей.

### Level B — Site Extension

Требует строгого pipeline и release approval:

- новый block;
- новый UI-компонент;
- новая бизнес-логика в пределах site extension;
- новый integration adapter;
- новые поля/коллекции проекта.

### Level C — Platform Core

Недоступно обычному клиентскому агенту:

- изменение AI plugin;
- лицензирование;
- billing;
- auth framework;
- ecommerce core;
- shared deployment code;
- security policy;
- общие пакеты.

Запрос Level C должен создавать Agency Engineering Request, а не автоматически менять клиентский проект.

---

