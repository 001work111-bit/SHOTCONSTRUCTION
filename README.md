# Shot Composer

Локальный **визуальный конструктор и рандомизатор изображений** для сборки превью одностраничного сайта.
Работает целиком в браузере: **без backend, без сервера, без загрузки файлов куда-либо**.
Исходные изображения никогда не изменяются, не переименовываются и не копируются — проект хранит только ссылки.

```
Проект → Блоки (секции сайта) → текущие изображения → Favorites (на блок) → Stacks (комбинации)
```

---

## Запуск

```bash
npm install

npm run dev        # http://localhost:5173  (браузер, File System Access API)
npm run build      # tsc + production build → ./dist
npm test           # 35 тестов: домен, контроллер (сценарий целиком), UI smoke
npm run typecheck
```

Опционально — проверка в реальном браузере (Playwright не входит в зависимости приложения):

```bash
npm i -D playwright && npx playwright install chromium
node tools/qa-scenario.mjs        # 34 проверки сценария из ТЗ в живом приложении
node tools/screens.mjs            # серия скриншотов всех панелей и preview
node tools/bench-catalog.mjs      # замеры на каталоге ~20 000 файлов
```

Первый запуск без своих фотографий: кнопка **«Try demo catalog»** / **«Demo catalog»** —
загружается небольшой каталог из `public/demo` (5 папок × 4 файла), проходящий через тот же
реальный конвейер (декодирование, миниатюры, рандомайзер, favorites, stacks).

### Electron (готово к переносу, не обязательно)

```bash
npm i -D electron            # + опционально: npm i sharp   (нативные TIFF / HEIC)
npm run build
npm run electron             # или: npm run electron:dev  (грузит Vite dev server)
```

Ядро, рандомайзер, stacks, preview и весь UI при этом **не меняются** — подменяется только
`FileSystemAdapter` (`src/filesystem/browser.ts` → `src/filesystem/electron.ts`).

---

## Что реализовано

Полный отчёт о проверке (сценарии, замеры производительности, найденные и исправленные
ошибки, известные ограничения) — в `VERIFICATION.md`.

| Требование ТЗ | Где |
|---|---|
| Загрузка корневой папки, рекурсивный скан, группировка по папкам (§23–24) | `filesystem/browser.ts`, `core/assets.ts::applyScan` |
| Большие каталоги: metadata → thumbnail по видимости → full image (§26, §70) | `filesystem/thumbs.ts` (ImageService, LRU бюджет, очередь декодирования) |
| Виртуализация списков (§69) | `ui/hooks.ts` (`useVirtualWindow`, `useVirtualGrid`) |
| Блоки: количество, стабильные id, размер, aspect, ratio-lock (§6, §12–14, §76) | `core/blocks.ts` |
| Fit (Cover/Contain/Fill), object position X/Y (§15) | `BlockCard`, инспектор → Image |
| Текстовый JSON-шаблон, применяется ко всем блокам (§16) | `core/templates.ts`, панель **Text** |
| Inline-редактирование текста прямо на блоке, локальный override (§17–19) | `ui/components/BlockText.tsx` |
| Overlay: глобальный + индивидуальный, вкл/выкл на блок (§20–22) | `core/blocks.ts`, панели **Overlay** |
| Выбор папок для блока, Select All / Clear All (§27) | инспектор → Sources |
| Randomize All / Selected / кубик на блоке, единый алгоритм (§28–31, §72–74) | `core/randomizer.ts` (одна точка входа) |
| Lock / Unlock / Lock All, массовые операции пропускают locked (§32–33, §90–91) | `core/randomizer.ts`, панель **Random** |
| Favorites строго на конкретный блок + **визуальный счётчик у каждого блока** | `core/favorites.ts`, чип `★ N` в шапке блока |
| Use favorites с fallback на папки, если favorites пусты (§36–37) | `randomizer.resolvePool` |
| Drag & drop внешнего файла на блок (§38–39, §67) | `controller.handleBlockDrop` |
| Stacks: сохранение, автнумерация, навигация, применение только картинок (§41–44, §78) | `core/stacks.ts` |
| Undo/Redo, атомарность массовых операций (§45–47) | `core/history.ts` + `controller.run()` (одна операция = одна запись) |
| Save / Load проекта в JSON, версия, валидация, relink (§48–49, §66, §79) | `persistence/*`, `core/validation.ts` |
| Автосохранение в IndexedDB (§50) | `persistence/autosave.ts` |
| Preview Mode: ESC, переходы (fade/slide/cross/zoom), autoplay, loop, мышь/клавиши, кубик (§51–60, §92) | `core/preview.ts`, `ui/preview/PreviewOverlay.tsx` |
| Hotkeys Ctrl+Z / Ctrl+Y / Ctrl+S / Ctrl+O / Ctrl+B / Esc / стрелки / R (§82) | `controller.installHotkeys` |
| Статусы Saved / Saving / Unsaved, счётчики, missing-файлы (§83, §62) | Header, StatusBar |
| Поиск по файлам и папкам (§68) | панель **Images** |
| Ошибки вместо `console.error` (§80–81, §107) | `core/errors.ts` + тосты |

---

## Архитектура

```
UI (React)  →  AppController  →  core/*  (чистый домен, без React и DOM)
                     │
                     └─→ FileSystemAdapter  (browser | electron)
```

* `src/core/` — модель, состояние, редьюсеры, история. Юнит-тестируется без браузера.
* `src/filesystem/` — адаптеры файловой системы, IndexedDB, конвейер миниатюр, демо-каталог.
* `src/persistence/` — сериализация, загрузка/валидация/relink, автосохранение.
* `src/ui/` — только представление: читает селекторы, вызывает методы контроллера.
* `electron/` — main + preload, готовые к запуску; реализуют тот же контракт адаптера.

Подробный разбор модели данных, дерева компонентов и найденных противоречий ТЗ — в `ARCHITECTURE.md`.

### Четыре независимых сущности, которые не смешиваются

| Сущность | Смысл | Хранение |
|---|---|---|
| **Asset** | физическая картинка на диске | метаданные + ссылка, байты не копируются |
| **Block** | секция сайта с одной картинкой | `imageAssetId` |
| **Favorite** | понравившаяся картинка **для конкретного блока** | `favorites[blockId] = assetId[]` |
| **Stack** | сохранённая комбинация картинок всех блоков | `entries: { blockId → assetId }` |

Текст: глобальный шаблон → копия/наследование в каждом блоке → локальный override.
Рандомизация не трогает текст, overlay, папки, favorites, lock и stacks; stack восстанавливает только изображения.

---

## Горячие клавиши

`Ctrl+Z` undo · `Ctrl+Y` / `Ctrl+Shift+Z` redo · `Ctrl+S` экспорт проекта · `Ctrl+O` импорт ·
`Ctrl+B` добавить блок · `Esc` выйти из preview / завершить редактирование ·
`↑ ↓ ← →` и колесо — навигация в preview · `R` — рандомизировать активный блок в preview.
