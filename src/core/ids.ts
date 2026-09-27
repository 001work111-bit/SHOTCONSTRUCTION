/** Stable id generation. Array indices are never used as identity (spec §76). */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(length: number): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** `block_7f82a` style ids: readable prefix + random suffix */
export function createId(prefix: string, length = 5): string {
  return `${prefix}_${randomToken(length)}`;
}

export const createBlockId = () => createId('block');
export const createAssetId = () => createId('asset');
export const createFolderId = () => createId('folder');
export const createStackId = () => createId('stack');
export const createProjectId = () => createId('project');
export const createToastId = () => createId('toast', 6);

/** Deterministic id for a scanned file, so a rescan keeps references stable. */
export function stableAssetId(path: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < path.length; i += 1) {
    const c = path.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619;
    h2 = (h2 + c * 31) | 0;
    h1 >>>= 0;
  }
  const a = (h1 >>> 0).toString(36);
  const b = (h2 >>> 0).toString(36);
  return `asset_${a}${b}`;
}

export function stableFolderId(path: string): string {
  return `folder_${stableAssetId(path).slice('asset_'.length, 'asset_'.length + 8)}`;
}
