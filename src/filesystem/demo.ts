/**
 * Bundled demo catalog.
 *
 * It is a convenience path so the app can be tried without a real photo library
 * (and so it works inside sandboxed previews where a directory picker is unavailable).
 * The files live in `public/demo/` and go through exactly the same pipeline as a scanned
 * folder — real bytes, real decode, real thumbnails. Nothing about the randomizer,
 * favorites or stacks is stubbed for them.
 */

export const DEMO_FOLDERS: Record<string, number> = {
  Auto: 6,
  Electronics: 6,
  Construction: 6,
  Medicine: 6,
  Chemistry: 6,
};

export interface BundledEntry {
  /** path relative to the catalog root, e.g. `Auto/001.jpg` */
  path: string;
  url: string;
}

export function demoEntries(baseUrl = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'): BundledEntry[] {
  const entries: BundledEntry[] = [];
  for (const [folder, count] of Object.entries(DEMO_FOLDERS)) {
    for (let i = 1; i <= count; i += 1) {
      const path = `${folder}/${String(i).padStart(3, '0')}.jpg`;
      entries.push({ path, url: `${baseUrl}demo/${path}` });
    }
  }
  return entries;
}
