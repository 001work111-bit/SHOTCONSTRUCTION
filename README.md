# SHOT Constructor

Визуальный конструктор картинок для предпросмотра страниц: каталог изображений → блоки
со случайным выбором → стопки (stacks) → полноэкранный предпросмотр с переходами.
React + Vite + Tailwind, плюс десктоп-оболочка на Electron.

## Быстрый старт (локально)

```bat
npm install
npm run dev            :: веб-версия → http://127.0.0.1:5173
```

## Запуск в оболочке Electron

```bat
npm run electron:dev       :: разработка: Vite + окно Electron, HMR
npm run electron:preview   :: production-режим: npm run build и запуск окна из dist/index.html
npm run check              :: typecheck + самопроверки десктоп-логики + сборка
```

## Сборка .exe под Windows

```bat
npm run electron:dist            :: установщик NSIS + portable (release/)
npm run electron:dist:installer  :: только установщик
npm run electron:dist:portable   :: только portable .exe
npm run electron:dist:dir        :: release\win-unpacked для быстрой проверки
```

Подробности, требования (Node 20.19+/Windows 10+), отличие десктоп-режима от веб-версии,
где лежат данные приложения и разбор частых проблем — в
[docs/ELECTRON_WINDOWS.md](docs/ELECTRON_WINDOWS.md).

## Как устроено приложение

В браузере картинки читаются через File System Access API и живут как `blob:`-URLи.
В Electron те же интерфейсы реализованы поверх Node: main-процесс сканирует папку,
изображения отдаются по кастомной схеме `shotasset://` прямо с диска, проект
сохраняется/открывается системным диалогом, а `sourceKey` ассета — абсолютный путь,
поэтому проект переживает перезапуск. Выбор реализации происходит автоматически
по наличию `window.shotDesktop` (`src/filesystem/FileSystemAdapter.ts`).

```
src/core         модель проекта, история, рандомайзер, сериализация (платформо-независимо)
src/components   UI: панель, воркспейс, инспектор, предпросмотр
src/store        ProjectStore — единая точка состояния и команд
src/desktop      мост Electron: типы, URL-контракт, инициализация оболочки
src/filesystem   адаптеры доступа к файлам (browser / desktop)
electron/        main.cjs, preload.cjs, fs-bridge.cjs
scripts/         dev-запуск, генерация иконки, самопроверки
```

## Данные

Проект автосохраняется локально (IndexedDB в профиле приложения), никуда не отправляется:
сетевого доступа приложение не требует. Экспорт/импорт — обычный JSON
(`Файл → Сохранить проект`).
