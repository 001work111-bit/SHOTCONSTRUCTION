import type { Asset, AssetId } from '../core/types';
import { isDisplayable, formatNote } from '../core/formats';
import type { ImageSource, StoredRef } from './adapter';

/**
 * Image pipeline (spec §70–71): metadata first → thumbnail when visible → full image when needed.
 *
 * Rules:
 *  • nothing is decoded until somebody actually asks for a URL;
 *  • decoding runs through a bounded queue (never hundreds of parallel decodes);
 *  • every produced URL lives in a byte-budgeted LRU cache and is revoked on eviction,
 *    so a 100k catalog cannot grow memory without limit;
 *  • sizes are bucketed (256 / 512 / 1024 / 2048 / original) so the cache is shared
 *    between the grid, the block workspace and the preview.
 */

export const THUMB_BUCKETS = [192, 384, 768, 1536, Infinity] as const;
export type ThumbBucket = (typeof THUMB_BUCKETS)[number];

export function bucketFor(maxEdge: number): ThumbBucket {
  for (const bucket of THUMB_BUCKETS) {
    if (maxEdge <= bucket) return bucket;
  }
  return Infinity;
}

interface CacheEntry {
  url: string;
  bytes: number;
  width?: number;
  height?: number;
  unsupported?: boolean;
  note?: string;
  lastUsed: number;
  revoke: boolean;
}

export interface ImageServiceStats {
  entries: number;
  bytes: number;
  budgetBytes: number;
  pending: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface ImageServiceOptions {
  openBlob: (ref: StoredRef) => Promise<Blob | null>;
  budgetMB?: number;
  concurrency?: number;
  /** natural size discovered during decode — pushed back into asset metadata */
  onDimensions?: (assetId: AssetId, width: number, height: number) => void;
  onQueueChange?: (pending: number) => void;
}

const VECTOR_FORMATS = new Set(['svg']);
const NO_RESIZE_FORMATS = new Set(['svg', 'gif']); // animation + vector must stay untouched

export class ImageService {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<ImageSource>>();
  private queue: (() => void)[] = [];
  private active = 0;
  private budgetBytes: number;
  private concurrency: number;
  private opts: ImageServiceOptions;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private objectUrls = new Set<string>();

  constructor(options: ImageServiceOptions) {
    this.opts = options;
    this.budgetBytes = (options.budgetMB ?? 48) * 1024 * 1024;
    this.concurrency = Math.max(1, options.concurrency ?? 3);
  }

  setBudgetMB(mb: number): void {
    this.budgetBytes = Math.max(8, mb) * 1024 * 1024;
    this.evictIfNeeded();
  }

  stats(): ImageServiceStats {
    let bytes = 0;
    for (const entry of this.cache.values()) bytes += entry.bytes;
    return {
      entries: this.cache.size,
      bytes,
      budgetBytes: this.budgetBytes,
      pending: this.active + this.queue.length,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private key(asset: Asset, bucket: ThumbBucket): string {
    return `${asset.id}@${bucket}`;
  }

  /** Request a display URL for an asset. Resolves immediately from cache when possible. */
  async resolve(asset: Asset, maxEdge: number, ref: StoredRef | null): Promise<ImageSource> {
    const bucket = bucketFor(maxEdge);
    const key = this.key(asset, bucket);

    const cached = this.cache.get(key);
    if (cached) {
      this.hits += 1;
      cached.lastUsed = Date.now();
      return {
        url: cached.url,
        width: cached.width,
        height: cached.height,
        unsupported: cached.unsupported,
        note: cached.note,
      };
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    this.misses += 1;
    const task = (async () => {
      if (asset.source === 'folder' && !isDisplayable(asset.format)) {
        const entry: CacheEntry = {
          url: '',
          bytes: 0,
          unsupported: true,
          note: formatNote(asset.format),
          lastUsed: Date.now(),
          revoke: false,
        };
        this.cache.set(key, entry);
        return { url: '', unsupported: true, note: entry.note } satisfies ImageSource;
      }

      if (!ref) {
        return { url: '', unsupported: true, note: 'File reference is unavailable — relink the folder.' } satisfies ImageSource;
      }

      const result = await this.withSlot(async () => {
        const blob = await this.opts.openBlob(ref as StoredRef);
        if (!blob) return { url: '', unsupported: true, note: 'File could not be read.' } satisfies ImageSource;
        return this.decode(asset, blob, bucket);
      });

      if (result.width && result.height) this.opts.onDimensions?.(asset.id, result.width, result.height);

      const entry: CacheEntry = {
        url: result.url,
        bytes: estimateBytes(result.width, result.height, result.original),
        width: result.width,
        height: result.height,
        unsupported: result.unsupported,
        note: result.note,
        lastUsed: Date.now(),
        revoke: !result.original,
      };
      if (result.url) this.objectUrls.add(result.url);
      this.cache.set(key, entry);
      this.evictIfNeeded(result.url ? result.url : undefined);
      return result;
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, task);
    return task;
  }

  /** Warm the cache for rows the user is about to see (virtual list overscan). */
  prefetch(asset: Asset, maxEdge: number, ref: StoredRef | null): void {
    const bucket = bucketFor(maxEdge);
    const key = this.key(asset, bucket);
    if (this.cache.has(key) || this.inflight.has(key)) return;
    void this.resolve(asset, bucket === Infinity ? Number.MAX_SAFE_INTEGER : bucket, ref);
  }

  releaseAsset(assetId: AssetId): void {
    for (const [key, entry] of [...this.cache.entries()]) {
      if (!key.startsWith(`${assetId}@`)) continue;
      this.revokeEntry(entry);
      this.cache.delete(key);
    }
  }

  clear(): void {
    for (const entry of this.cache.values()) this.revokeEntry(entry);
    this.cache.clear();
    this.objectUrls.clear();
  }

  private revokeEntry(entry: CacheEntry): void {
    if (!entry.revoke || !entry.url) return;
    this.objectUrls.delete(entry.url);
    URL.revokeObjectURL(entry.url);
  }

  /**
   * Byte-budgeted LRU. Tiles that were touched in the last couple of seconds are kept —
   * they are most likely painted right now, and revoking their URL would blank the <img>.
   * If the budget is still exceeded afterwards, the guard is dropped so memory stays bounded.
   */
  private evictIfNeeded(protectedUrl?: string): void {
    let total = 0;
    for (const entry of this.cache.values()) total += entry.bytes;
    if (total <= this.budgetBytes) return;

    const now = Date.now();
    const collect = (respectRecency: boolean) =>
      [...this.cache.entries()]
        .filter(([, entry]) => entry.url && entry.url !== protectedUrl && (!respectRecency || now - entry.lastUsed > 2500))
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    for (const respectRecency of [true, false]) {
      for (const [key, entry] of collect(respectRecency)) {
        if (total <= this.budgetBytes) return;
        total -= entry.bytes;
        this.revokeEntry(entry);
        this.cache.delete(key);
        this.evictions += 1;
      }
      if (total <= this.budgetBytes) return;
    }
  }

  private async withSlot<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    this.opts.onQueueChange?.(this.active + this.queue.length);
    try {
      return await job();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
      this.opts.onQueueChange?.(this.active + this.queue.length);
    }
  }

  private async decode(asset: Asset, blob: Blob, bucket: ThumbBucket): Promise<ImageSource> {
    const noResize = NO_RESIZE_FORMATS.has(asset.format) || bucket === Infinity;

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      bitmap = null;
    }

    if (!bitmap) {
      // Browser cannot decode it (or it is a vector without intrinsic size):
      // fall back to a direct object URL — for SVG/GIF that is the correct rendering anyway.
      if (VECTOR_FORMATS.has(asset.format) || asset.format === 'gif') {
        const url = URL.createObjectURL(blob);
        return { url, width: asset.width, height: asset.height, original: true, note: 'Vector / animated original' };
      }
      return { url: '', unsupported: true, note: 'This file cannot be decoded by the browser.' };
    }

    const width = bitmap.width;
    const height = bitmap.height;
    const longest = Math.max(width, height);

    if (noResize || longest <= (bucket as number)) {
      const url = URL.createObjectURL(blob);
      bitmap.close();
      return { url, width, height, original: true };
    }

    const scale = (bucket as number) / longest;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    try {
      const canvas = createCanvas(targetW, targetH);
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new Error('no 2d context');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, targetW, targetH);
      bitmap.close();
      const outBlob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(outBlob);
      return { url, width, height };
    } catch {
      const url = URL.createObjectURL(blob);
      bitmap.close();
      return { url, width, height, original: true };
    }
  }
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    try {
      return await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
    } catch {
      return canvas.convertToBlob();
    }
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/webp',
      0.85,
    );
  });
}

function estimateBytes(width?: number, height?: number, original?: boolean): number {
  if (!width || !height) return 32 * 1024;
  const px = width * height;
  return original ? Math.min(px * 3, 32 * 1024 * 1024) : px * 0.5;
}
