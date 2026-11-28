# Настройки шаблона Realize

| Настройка | Допустимые значения | По умолчанию |
| --- | --- | --- |
| `density` — плотность интерфейса | `comfortable`, `compact` | `comfortable` |
| `panelWidth` — ширина внутренней навигации на широком экране | Целое число от 220 до 400 пикселей включительно | `280` |

Настройки проверяются strict Zod source `src/settings/realizeSettings.schemas.ts`.
Значения по умолчанию `comfortable` и `280` сохраняют reference. Settings schema
version `1.0.0` отдельна от package version; команда
`npm run generate:settings-schema` в этом пакете генерирует
`settings.schema.json` штатным `z.toJSONSchema`. Settings обновляют style tokens,
их хранение и revision принадлежат host.
