# SHOT Constructor — запуск локально и сборка под Windows (Electron)

Документ описывает, как запустить приложение в оболочке Electron на своей машине и как
собрать `.exe` (установщик и portable).

---

## 1. Что нужно установить

| Компонент | Версия | Зачем |
| --- | --- | --- |
| Windows | 10 или 11, x64 | Electron 44 не поддерживает Windows 7/8 |
| Node.js | ≥ 20.19, рекомендуется 22 LTS | сборщик Vite 7 и скрипты `scripts/*.mjs` |
| npm | 10+ (идёт в комплекте Node) | установка зависимостей |

Проверить: `node -v`, `npm -v`. Node можно взять на [nodejs.org](https://nodejs.org)
(x64 Installer) или через `winget install OpenJS.NodeJS.LTS`.

Для сборки `.exe` **не нужны** Visual Studio, Python, WiX и прочее — нужны только Node и npm.
Никакого интернета во время работы самого приложения не требуется.

## 2. Установка зависимостей

```bat
cd SHOTCONSTRUCTION
npm ci
```

`npm ci` ставит ровно то, что зафиксировано в `package-lock.json`
(если его нет/он конфликтует — `npm install`).

При первом `npm install` скачивается бинарник Electron (~110 МБ) для текущей платформы.
Если он не скачался, `npm run electron:dev` об этом скажет и подскажет команды —
см. [раздел 8 «Проблемы»](#8-возможные-проблемы).

## 3. Быстрая проверка без Electron

```bat
npm run dev          :: веб-версия на http://127.0.0.1:5173
npm run build        :: production-сборка в dist/index.html (один файл)
npm run check        :: typecheck + самопроверки + build
```

Веб-версия работает как раньше: выбор папки через File System Access API
(или `<input webkitdirectory>`), экспорт проекта — через скачивание файла.

## 4. Запуск в Electron: режим разработки (HMR)

```bat
npm run electron:dev
```

Что происходит:

1. поднимается Vite dev-сервер на `127.0.0.1:5173` (порт: `set SHOT_VITE_PORT=5174`);
2. скрипт ждёт готовности сервера;
3. запускается Electron с `ELECTRON_START_URL`, окно грузит dev-сервер,
   DevTools открываются отдельно.

Правки в `src/**` применяются на лету. Правки в `electron/main.cjs` требуют
перезапуска (`Ctrl+C` и снова `npm run electron:dev`); `View → Reload` в меню окна
перезагружает renderer.

Дополнительные аргументы Electron передаются после `--`:

```bat
npm run electron:dev -- --inspect=9229
```

## 5. Запуск собранного приложения «как будет у пользователя»

```bat
npm run electron:preview
```

Собирает `dist/` и запускает Electron так, как он запускается из пакета:
окно грузит `dist/index.html` по `file://`, включается CSP из билда,
без hot reload и без DevTools-панели в открытом состоянии.

## 6. Сборка дистрибутива для Windows

```bat
npm run electron:dist              :: установщик NSIS + portable, x64
npm run electron:dist:installer    :: только установщик
npm run electron:dist:portable     :: только portable .exe
npm run electron:dist:dir          :: release\win-unpacked — «зелёная» папка для быстрой проверки
```

Результат в `release/`:

```
release/
  SHOTConstructor-0.1.0-Setup.exe        установщик (можно выбрать папку, ярлыки на столе/в «Пуске»)
  SHOTConstructor-0.1.0-Portable.exe     один файл: запустил — работает, ничего не устанавливается
  win-unpacked/                           распакованное приложение (эмуляция установленной программы)
```

Конфигурация сборки — [`electron-builder.yml`](../electron-builder.yml):
`productName`, иконка, цели, локали, имя артефактов. Иконка генерируется скриптом:

```bat
npm run electron:icon
```

Перед сборкой можно поднять версию в `package.json` (`version`), она попадает
в свойства файла и в имя артефакта.

## 7. Что «умеет» десктоп-режим

| Возможность | Браузер | Electron |
| --- | --- | --- |
| Выбор папки с картинками | `showDirectoryPicker` / `webkitdirectory` | системный диалог Windows, рекурсивный обход в main-процессе |
| Показ картинок | `blob:` URL (копии в памяти) | чтение с диска через схему `shotasset:` без копий |
| Сохранение проекта | скачивание `<name>.json` | «Сохранить как…» → запись в файл, `Ctrl+S` пишет в тот же файл |
| Открытие проекта | выбор файла | системный диалог + меню «Файл → Последние проекты» |
| Проект после перезапуска | картинки теряются (blob живёт до перезагрузки) | работают, если пути на месте |
| Drag & drop файла на блок | копируется в память | запоминается абсолютный путь |
| Меню, полный экран, зум | нет | нативное меню «Файл/Правка/Вид/Окно/Справка», `F11` |
| Ограничение доступа к файлам | песочница браузера | разрешены корни выбранных папок/проектов (`allowed-roots.json`) |

Горячие клавиши: `Ctrl+S` сохранить, `Ctrl+Shift+S` сохранить как, `Ctrl+O` открыть,
`Ctrl+Alt+N` новый проект, `Ctrl+Z`/`Ctrl+Y` история, `F11` полный экран,
`Ctrl+Shift+I` DevTools, `Alt` показать строку меню.

Данные приложения: `%APPDATA%\SHOT Constructor\`

- автосохранение проекта — IndexedDB (`Partitions`/`Local Storage` внутри профиля);
- `window-state.json` — размер/позиция окна;
- `allowed-roots.json` — папки, из которых разрешено читать картинки;
- `recent-projects.json` — список последних проектов в меню.

Полный сброс: закрыть приложение и удалить папку `%APPDATA%\SHOT Constructor`.

## 8. Возможные проблемы

**SmartScreen: «Windows protected your PC».** Приложение не подписано сертификатом
издателя. Нажмите «More info» → «Run anyway». Убрать этот экран может только платная
код-подпись (`win.sign` в electron-builder) — в проекте не настроена.

**Антивирус медленно проверяет portable-.exe.** Portable при каждом старте
распаковывается во временную папку. Для работы-на-каждый-день удобнее установщик
или `win-unpacked`.

**`npm install` не докачал Electron** (корпоративный прокси, самоподписанный сертификат,
офис без доступа к GitHub):

```bat
npm cache clean --force
rmdir /s /q node_modules\electron
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

Проверка: в `node_modules\electron\dist\` должен лежать `electron.exe`.
Аварийный вариант — запуск веб-версии (`npm run dev`) без Electron; скрипты
`electron:*` тогда не работают.

**Сборка `.exe` из Linux/macOS** требует Wine (electron-builder правит ресурсы PE-файла).
На Windows ничего дополнительно не нужно — сборка рассчитана на Windows.

**Картинки пропали после перезапуска.** Проект хранит абсолютные пути
(`D:\Рендеры\01\shot.jpg`). Если папку перенесли/переименовали или диск сетевой
и не подключён — нажмите ↻ («Re-scan folder») в панели Project или выберите папку заново.
Файлы, которых нет на диске, помечаются как «Missing asset», а не тянутся молча.

**Очень большой каталог.** По умолчанию сканируется до 20 000 картинок;
при переполнении появляется предупреждение. Лимит: `set SHOT_MAX_IMAGES=50000`.
Для каталога на сетевом диске первое сканирование может занимать минуты — это I/O, не CPU.

**HEIC/TIFF не показываются.** Эти форматы помечаются как «unsupported»: они
не отображаются Chromium. Остальное (jpg/png/webp/gif/svg/avif/bmp) работает.

**Окно открылось «за пределами экрана»** (например, после смены монитора) —
удалите `%APPDATA%\SHOT Constructor\window-state.json`.

**Хочется смотреть логи.** В dev-режиме (`npm run electron:dev`) консоль main-процесса
выводится в терминал; в собранном приложении — `View → Инструменты разработчика`.

## 9. Структура файлов

```
electron/
  main.cjs            окно, меню, протокол shotasset:, IPC, политика безопасности
  preload.cjs         contextBridge → window.shotDesktop (только нужные функции)
  fs-bridge.cjs       вся работа с диском и stores — чистый Node, без electron
src/desktop/
  api.ts              типы моста + getDesktop() / desktopAssetUrl()
  assetUrl.ts         путь → shotasset-URL (контракт с main.cjs)
  bootstrap.ts        оболочка: data-shell, асинхронная загрузка веб-шрифта
src/filesystem/FileSystemAdapter.ts
                      BrowserFileSystemAdapter + DesktopFileSystemAdapter
                      (выбор адаптера — по наличию window.shotDesktop)
scripts/
  electron-dev.mjs            dev-запуск (Vite + Electron), без сторонних зависимостей
  desktop-selftest.mjs        18 проверок fs-логики, контрактов IPC и smoke-прогон main.cjs
  desktop-selftest-catalog.mjs  5 проверок отображения каталога в модель проекта
  generate-icon.mjs           генерация build/icon.png и build/icon.ico
electron-builder.yml  конфигурация дистрибутива
```

Полезные команды:

```bat
npm run check              :: typecheck + все самопроверки + build
npm run electron:selftest  :: только самопроверки (работают без GUI и без Electron)
```
