#!/bin/bash
# Visual Constructor — запуск в один двойной клик (macOS)
# Вся логика — в scripts/launch.cjs, здесь только проверка Node.js.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Нужно один раз установить Node.js:"
  echo "  1. Откройте https://nodejs.org"
  echo "  2. Нажмите кнопку LTS — скачается установщик"
  echo "  3. Установите его и запустите этот файл снова"
  echo ""
  read -r -p "Нажмите Enter, чтобы закрыть..." _
  exit 1
fi

node "$(dirname "$0")/scripts/launch.cjs"
status=$?
if [ "$status" -ne 0 ]; then
  echo ""
  echo "Произошла ошибка — прочитайте сообщения выше."
fi
read -r -p "Нажмите Enter, чтобы закрыть окно..." _
exit $status
