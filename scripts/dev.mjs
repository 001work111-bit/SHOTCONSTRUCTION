import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * dev.mjs — разработка в Electron.
 *
 * 1. поднимает Vite dev-server на http://localhost:5173
 * 2. ждёт, пока порт начнёт слушать
 * 3. запускает Electron с VITE_DEV_SERVER_URL
 *
 * Ctrl+C гасит оба процесса.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const DEV_URL = 'http://localhost:5173';

const bin = (name) => path.join(root, 'node_modules', '.bin', name);
const isWin = process.platform === 'win32';

function spawnCmd(command, args, env) {
  const child = spawn(isWin ? `${command}.cmd` : command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: isWin,
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${command} завершился с кодом ${code}`);
    }
  });
  return child;
}

function waitForPort(port, host, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = createConnection({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Vite dev-server не поднялся на порту ${port} за ${timeoutMs} мс`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

const vite = spawnCmd(bin('vite'), ['--host', '127.0.0.1'], {});

let electron = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    vite?.kill('SIGTERM');
  } catch {}
  try {
    electron?.kill('SIGTERM');
  } catch {}
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

waitForPort(5173, '127.0.0.1')
  .then(() => {
    console.log(`[dev] Vite готов → ${DEV_URL}, запускаю Electron…`);
    electron = spawnCmd(bin('electron'), ['.'], {
      VITE_DEV_SERVER_URL: DEV_URL,
      SHOTC_DEVTOOLS: process.env.SHOTC_DEVTOOLS ?? '',
      ELECTRON_ENABLE_LOGGING: '1',
    });
    electron.on('exit', (code) => shutdown(code ?? 0));
  })
  .catch((e) => {
    console.error('[dev] ошибка:', e.message);
    shutdown(1);
  });
