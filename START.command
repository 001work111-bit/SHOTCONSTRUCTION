#!/bin/bash
# Visual Constructor — простой запуск (всё уже установлено)
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не установлен. Запустите ЗАПУСК.command — он объяснит, что делать."
  read -r -p "Нажмите Enter..." _
  exit 1
fi

node "$(dirname "$0")/scripts/launch.cjs" --quick
read -r -p "Нажмите Enter, чтобы закрыть окно..." _
