/**
 * assetUrl.ts — единственное место, где renderer собирает URL для картинок с диска.
 *
 * ВНИМАНИЕ: `encodeDesktopAssetPath` должна оставаться совместимой с
 * `assetUrlToPath()` из electron/fs-bridge.cjs — контракт проверяется в
 * `npm run desktop:selftest`.
 */

/** Схема, зарегистрированная в electron/main.cjs через protocol.registerSchemesAsPrivileged */
export const DESKTOP_ASSET_SCHEME = 'shotasset';

/**
 * Абсолютный путь → `shotasset://f/<путь целиком в одном процентно-закодированном сегменте>`.
 *
 * Путь кодируется ОДНИМ сегментом (включая разделители), поэтому кириллица, пробелы,
 * `%`, `#`, `?` ислеши в именах файлов не ломают URL. Хост-заглушка `f` нужна,
 * чтобы схема со `standard: true` гарантированно получилась корректной.
 */
export function encodeDesktopAssetPath(absPath: string): string {
  return `${DESKTOP_ASSET_SCHEME}://f/${encodeURIComponent(String(absPath))}`;
}

/** Похоже ли значение на абсолютный путь к файлу на диске (а не blob:/idb:/относительный) */
export function isDesktopPathLike(value: string | undefined | null): boolean {
  if (!value) return false;
  if (/^(blob:|data:|idb:|https?:|file:|shotasset:)/i.test(value)) return false;
  // C:\... или C:/... или /mnt/...
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/');
}
