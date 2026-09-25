/**
 * electron-dev.mjs — dev-режим Electron + Vite без дополнительных зависимостей.
 *
 *   npm run electron:dev [-- --额外的electron-аргументы]
 *
 * 1. поднимает `vite` на 127.0.0.1:5173 (порт можно менять через SHOT_VITE_PORT);
 * 2. ждёт готовности;
 * 3. запускает electron с ELECTRON_START_URL, чтобы main.cjs грузил dev-сервер.
 *
 * Написано на чистом Node, потому что на Windows `concurrently`/`cross-env`
 * и shell-синтаксис `VAR=1 cmd` ведут себя по-разному.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const port = Number(process.env.SHOT_VITE_PORT || 5173);
const devUrl = `http://127.0.0.1:${port}`;
const extraArgs = process.argv.slice(2).filter((a) => a !== '--');

function log(...args) {
  console.log('[electron:dev]', ...args);
}

/**
 * Пакеты с полем "exports" нельзя резолвить по внутреннему пути
 * (ERR_PACKAGE_PATH_NOT_EXPORTED), поэтому пробуем require.resolve
 * и падаем на прямой путь в node_modules.
 */
function resolveLocal(...segments) {
  const candidates = [path.join(ROOT, 'node_modules', ...segments)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveModule(specifier, fallback) {
  try {
    const resolved = require.resolve(specifier);
    if (existsSync(resolved)) return resolved;
  } catch {
    /* пакет с exports — спрашиваем путь вручную */
  }
  const local = resolveLocal(...fallback);
  if (local) return local;
  console.error(
    `Не нашёл ${specifier}. Установите зависимости: npm install`
  );
  process.exit(1);
}

function viteBinPath() {
  return resolveModule('vite/bin/vite.js', ['vite', 'bin', 'vite.js']);
}

function electronCliPath() {
  return resolveModule('electron/cli.js', ['electron', 'cli.js']);
}

function electronDirPath() {
  return path.dirname(resolveModule('electron/package.json', ['electron', 'package.json']));
}

function electronBinaryPath() {
  // node_modules/electron/path.txt содержит относительный путь к бинарнику
  const relFile = path.join(electronDirPath(), 'path.txt');
  if (!existsSync(relFile)) return null;
  const rel = readFileSync(relFile, 'utf8').trim();
  const bin = path.join(electronDirPath(), 'dist', rel);
  return existsSync(bin) ? bin : null;
}

function ensureElectronBinary() {
  if (process.env.SHOT_SKIP_ELECTRON_BINARY_CHECK === '1') return true;
  if (electronBinaryPath()) return true;
  console.error(
    [
      '',
      '  Бинарник Electron не скачан (node_modules/electron/dist отсутствует).',
      '  Это типично, если npm install прошёл в офлайне или через прокси с самоподписанным сертификатом.',
      '',
      '  Windows:',
      '    npm cache clean --force',
      '    rmdir /s /q node_modules\\electron',
      '    npm install',
      '',
      '  если корпоративный прокси подменяет сертификаты:',
      '    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/',
      '    npm install',
      '',
    ].join('\n')
  );
  return false;
}

async function waitForDevServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(devUrl, { signal: AbortSignal.timeout(1500) });
      if (res.status < 500) return true;
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
    } catch {
      /* уже завершился */
    }
  }
  // на Windows убийством потомка занимается process tree, просто выходим
  setTimeout(() => process.exit(code), process.platform === 'win32' ? 150 : 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  if (!ensureElectronBinary()) process.exit(1);

  const vite = spawn(process.execPath, [viteBinPath(), 'dev', '--port', String(port)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, SHOT_VITE_PORT: String(port) },
  });
  children.push(vite);
  vite.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0);
  });

  log('ожидание dev-сервера на', devUrl);
  const ready = await waitForDevServer();
  if (!ready) {
    console.error('Vite dev server не отвечает за 90 секунд — см. лог выше.');
    shutdown(1);
    return;
  }

  const electronCli = electronCliPath();
  log('запуск Electron →', devUrl);
  const electron = spawn(
    process.execPath,
    [electronCli, '.', ...extraArgs],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_START_URL: devUrl,
        // логи main-процесса в консоль, чтобы видеть ошибки загрузки/сканирования
        ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? '1',
      },
    }
  );
  children.push(electron);
  electron.on('exit', (code) => {
    log('Electron завершился с кодом', code);
    shutdown(code ?? 0);
  });
}

void main();
