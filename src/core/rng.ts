/**
 * Seeded pseudo random generator (mulberry32).
 *
 * The Randomizer always receives an RNG instance, never calls Math.random directly,
 * so a later "reproduce this combination" feature only has to replay the stored seed
 * (spec §73).
 */
export interface Rng {
  (): number;
  seed: string;
}

export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: string): Rng {
  let a = hashSeed(seed) || 1;
  const fn = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  fn.seed = seed;
  return fn;
}

export function createSeed(prefix = 'seed'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xfffff).toString(36)}`;
}

export function pickIndex(rng: Rng, length: number): number {
  if (length <= 0) return -1;
  return Math.min(length - 1, Math.floor(rng() * length));
}

export function randomCode(length = 4): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
