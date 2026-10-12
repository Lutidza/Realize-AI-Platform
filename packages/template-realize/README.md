# Шаблон Realize

`@realize/template-realize` владеет разметкой и оформлением шаблона Realize:
глобальной и внутренней навигацией, верхней панелью, крошками, меню и мобильным
представлением. Общие примитивы используются через публичный `@realize/ui-kit`.

Паспорт `realize-template.manifest.json` описывает `realize@0.1.0`: только Admin
screens `workspace/auth/status`, палитра `realize@0.1.0`, modes light/dark.
`@realize/template-realize/manifest` и корневой export читают паспорт без CSS
и renderer. `@realize/template-realize/admin` предоставляет `RealizeTemplate`
и `realizeTemplateDefinition`; SDK разрешает точные версии перед подключением.

Пакет предоставляет свои Button/Input через UI adapter и явно наследует default
foundation/остальные controls. Общие цвета, typography и базовые controls остаются
в UI-kit; navigation tokens и scrollbar styles принадлежат палитре пакета.
Примитивы сохраняют native ref/events, disabled и прежнюю comfortable geometry.

Настройки `density: comfortable|compact` и целая `panelWidth: 220..400`
проверяются strict Zod source `src/settings/realizeSettings.schemas.ts`.
Defaults comfortable/280 сохраняют reference. Settings schema version `1.0.0`
отдельна от package version; команда `npm run generate:settings-schema` в этом
пакете генерирует `settings.schema.json` штатным `z.toJSONSchema`.
Settings обновляют style tokens, их хранение/revision принадлежат host.

Публичный вход `@realize/template-realize/ui` предоставляет элементы текущего
шаблона и их props. Закреплённый Task Manager reference использует этот вход
для воспроизводимого сравнения с эталоном. Рабочие модули подключаются через
нейтральный template host и UI adapter установки.

Renderer передаёт adapter/palette/style через `UiTemplateProvider` всему chrome
и module content. Прямое использование `/ui` подключается под таким же provider
с закреплённой definition для reference. Frontend target этот пакет отклоняет
как `UNSUPPORTED_TARGET`; наличие frontend API в SDK не создаёт storefront.
Auth/status layouts размещают реальные content/actions host без проверки прав
или фиктивного login/recovery API.

Пакет не импортирует исходники host, Next routes или Payload collections;
маршрутизация, сессия, права, данные и бизнес-команды остаются у приложения.
Исходники композиции находятся в `src/layouts/admin/`.

Этот workspace package пока private. Наличие его исходников не означает
публикацию в npm, установку через Admin или активацию работающей сборки.
