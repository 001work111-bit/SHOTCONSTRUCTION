#!/usr/bin/env node
'use strict';

/**
 * launch.cjs — установка + сборка + запуск программы одной командой.
 *
 * Весь текст на экране печатает Node (а не cmd.exe), поэтому русские буквы
 * отображаются корректно на любой Windows. Сам .bat содержит только ASCII:
 * именно из-за русских символов внутри batch-файла cmd.exe ломал строки.
 *
 * Вызов:  node scripts/launch.cjs
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const NPM = isWin ? 'npm.cmd' : 'npm';

/**
 * Быстрый режим (START.bat): всё уже установлено и собрано —
 * не печатаем ничего лишнего, просто запускаем программу.
 * Если чего-то не хватает, скрипт всё равно доустановит и скажет об этом.
 */
const quick = process.argv.includes('--quick') || process.argv.includes('-q');

const C = {
  reset: '\u001b[0m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  cyan: '\u001b[36m',
  bold: '\u001b[1m',
};
// На старых консолях без ANSI цвета просто выключим
const useColor = process.platform !== 'win32' || process.env.WT_SESSION;

function paint(color, text) {
  return useColor ? `${C[color]}${text}${C.reset}` : text;
}

function info(text) {
  console.log(text);
}
function step(n, text) {
  console.log(`\n${paint('cyan', `[ШАГ ${n} из 3]`)} ${text}`);
}
function warn(text) {
  console.log(paint('yellow', text));
}
function fail(text) {
  console.log(paint('red', text));
}

function line() {
  console.log('='.repeat(56));
}

/** Выполнить команду и дождаться её. Возвращает код выхода. */
function run(command, args) {
  const res = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  if (res.error) {
    fail(`Не удалось запустить "${command}": ${res.error.message}`);
    return 1;
  }
  return res.status === null ? 1 : res.status;
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 1. Проверка Node.js                                                 */
/* ------------------------------------------------------------------ */
const LAUNCH_T0 = Date.now();
if (quick) {
  console.log('Запускаю программу...');
} else {
  line();
  console.log(paint('bold', '   Visual Constructor - Image Combinator'));
  line();
  console.log('');
}

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (!quick) step(1, `Node.js найден: v${process.versions.node}`);
if (nodeMajor < 18) {
  fail('');
  fail('Слишком старая версия Node.js. Нужна версия 18 или новее.');
  fail('Скачайте LTS с https://nodejs.org и запустите программу снова.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* 2. Установка компонентов                                            */
/* ------------------------------------------------------------------ */
const nodeModules = path.join(root, 'node_modules');

/** Ключевые пакеты, без которых программа не работает */
const REQUIRED_PACKAGES = ['electron', 'vite', 'react', 'react-dom', 'typescript'];

function missingPackages() {
  const missing = [];
  for (const pkg of REQUIRED_PACKAGES) {
    if (!exists(path.join(nodeModules, pkg))) missing.push(pkg);
  }
  return missing;
}

const missing = missingPackages();

if (missing.length > 0) {
  if (quick) {
    info(paint('yellow', 'Не хватает компонентов (' + missing.join(', ') + ') — устанавливаю, это займёт пару минут.'));
  }
  step(2, `Устанавливаю компоненты${missing.length < REQUIRED_PACKAGES.length ? ' (не хватает: ' + missing.join(', ') + ')' : ''}.`);
  if (!quick) {
    info('   Это займёт 2-5 минут (качается Electron, ~120 МБ).');
    info('   Окно может выглядеть "зависшим" - это нормально, не закрывайте его.');
    info('');
  }

  const code = run(NPM, ['install', '--no-audit', '--no-fund']);
  if (code !== 0) {
    fail('');
    fail('[ОШИБКА] Не удалось установить компоненты.');
    fail('Проверьте интернет и запустите программу снова.');
    process.exit(1);
  }

  const stillMissing = missingPackages();
  if (stillMissing.length > 0) {
    fail('');
    fail(`[ОШИБКА] Так и не установились: ${stillMissing.join(', ')}.`);
    fail('Закройте окно, удалите папку node_modules и запустите снова.');
    process.exit(1);
  }
  info('');
  info(paint('green', 'Компоненты установлены.'));
} else if (!quick) {
  step(2, 'Компоненты уже установлены - пропускаю.');
}

/* ------------------------------------------------------------------ */
/* 3. Сборка                                                           */
/* ------------------------------------------------------------------ */
const distIndex = path.join(root, 'dist', 'index.html');
if (!exists(distIndex)) {
  if (quick) info(paint('yellow', 'Сборки нет — собираю программу...'));
  step(3, 'Собираю программу (несколько секунд)...');
  const code = run(NPM, ['run', 'build']);
  if (code !== 0 || !exists(distIndex)) {
    fail('');
    fail('[ОШИБКА] Сборка не удалась.');
    process.exit(1);
  }
  info(paint('green', 'Сборка готова.'));
} else if (!quick) {
  step(3, 'Сборка уже готова - пропускаю.');
}

/* ------------------------------------------------------------------ */
/* Запуск                                                              */
/* ------------------------------------------------------------------ */
if (!quick) {
  console.log('');
  info(paint('green', 'Запускаю программу...'));
  info('Когда закончите - просто закройте окно программы.');
  info('Это окно закройте вместе с ней (или нажмите любую клавишу).');
  info('');
}

let electronBin;
try {
  // require('electron') из обычного Node возвращает путь к исполняемому файлу
  electronBin = require('electron');
} catch (e) {
  fail(`[ОШИБКА] Не найден исполняемый файл Electron: ${e.message}`);
  process.exit(1);
}

const child = spawn(electronBin, [root], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (process.env.SHOTC_TIMING) {
  console.log(`[timing] подготовка скрипта: +${Date.now() - LAUNCH_T0}ms`);
}

child.on('error', (e) => {
  fail(`[ОШИБКА] Не удалось запустить Electron: ${e.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code && code !== 0) {
    warn(`Программа закрылась с кодом ${code}.`);
  }
  // Даём консоли время дописать вывод
  setTimeout(() => process.exit(code === null ? 0 : code), 100);
});

// Ctrl+C гасит и Electron
process.on('SIGINT', () => {
  try {
    child.kill('SIGTERM');
  } catch {}
  setTimeout(() => process.exit(0), 200);
});
