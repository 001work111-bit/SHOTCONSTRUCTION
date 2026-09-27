import { useEffect, useState } from 'react';
import type { ID } from '../core/types';

/**
 * thumbs.ts — конвейер миниатюр.
 *
 * Зачем: в панели медиа может быть 400+ картинок, и если показывать их
 * в полном разрешении, браузер (и Electron вместе с ним) съест гигабайты
 * памяти. Здесь каждая картинка декодируется один раз, уменьшается до
 * нужного размера и живёт в кэше с бюджетом по байтам (LRU + revoke).
 *
 * Правила (как в reference-проекте):
 *  • ничего не декодируется, пока кто-то реально не попросил URL;
 *  • декодирование идёт через ограниченную очередь (не 400 параллельных decode);
 *  • каждый URL живёт в байт-бюджетном LRU-кэше и revoke'ится при вытеснении;
 *  • размеры «корзинные» (192 / 384 / 768 / оригинал), чтобы сетка,
 *    рабочие блоки и превью не гоняли три разные копии одной картинки;
 *  • SVG и GIF не трогаем: вектор и анимацию переживёт только оригинал.
 */

export const THUMB_BUCKETS = [192, 384, 768, 1536, Infinity] as const;
export type ThumbBucket = (typeof THUMB_BUCKETS)[number];

export function bucketFor(maxEdge: number): ThumbBucket {
  for (const bucket of THUMB_BUCKETS) {
    if (maxEdge <= bucket) return bucket;
  }
  return Infinity;
}

const NO_RESIZE = new Set(['svg', 'gif']);

export interface ThumbResult {
  url: string;
  width?: number;
  height?: number;
  unsupported?: boolean;
  note?: string;
  loading?: boolean;
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

export interface ThumbStats {
  entries: number;
  bytes: number;
  budgetBytes: number;
  pending: number;
}

export interface ThumbServiceOptions {
  /** Откуда взять отображаемый URL ассета (appimg:// в Electron, blob: в браузере) */
  getDisplayUrl: (assetId: ID) => Promise<string | null>;
  /** Помечает ассет как неподдерживаемый формат */
  isUnsupported?: (assetId: ID) => boolean;
  budgetMB?: number;
  concurrency?: number;
}

export class ThumbService {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<ThumbResult>>();
  private queue: Array<() => void> = [];
  private active = 0;
  private budgetBytes: number;
  private concurrency: number;
  private opts: ThumbServiceOptions;

  constructor(options: ThumbServiceOptions) {
    this.opts = options;
    this.budgetBytes = (options.budgetMB ?? 48) * 1024 * 1024;
    this.concurrency = Math.max(1, options.concurrency ?? 4);
  }

  stats(): ThumbStats {
    let bytes = 0;
    for (const entry of this.cache.values()) bytes += entry.bytes;
    return {
      entries: this.cache.size,
      bytes,
      budgetBytes: this.budgetBytes,
      pending: this.active + this.queue.length,
    };
  }

  private key(assetId: ID, bucket: ThumbBucket): string {
    return `${assetId}@${bucket}`;
  }

  /** Синхронно: если миниатюра уже в кэше — вернуть сразу (для мгновенной отрисовки) */
  peek(assetId: ID, maxEdge: number): ThumbResult | null {
    const entry = this.cache.get(this.key(assetId, bucketFor(maxEdge)));
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return {
      url: entry.url,
      width: entry.width,
      height: entry.height,
      unsupported: entry.unsupported,
      note: entry.note,
    };
  }

  async resolve(assetId: ID, maxEdge: number): Promise<ThumbResult> {
    const bucket = bucketFor(maxEdge);
    const key = this.key(assetId, bucket);

    const cached = this.cache.get(key);
    if (cached) {
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

    if (this.opts.isUnsupported?.(assetId)) {
      const entry: CacheEntry = {
        url: '',
        bytes: 0,
        unsupported: true,
        note: 'Формат не поддерживается',
        lastUsed: Date.now(),
        revoke: false,
      };
      this.cache.set(key, entry);
      return { url: '', unsupported: true, note: entry.note };
    }

    const task = (async (): Promise<ThumbResult> => {
      try {
        const displayUrl = await this.opts.getDisplayUrl(assetId);
        if (!displayUrl) {
          return { url: '', unsupported: true, note: 'Файл недоступен' };
        }

        // Оригинал и «неизменяемые» форматы отдаём как есть
        if (bucket === Infinity || NO_RESIZE.has(extOfUrl(displayUrl))) {
          return this.remember(key, displayUrl, 0, undefined, undefined, false);
        }

        return await this.withSlot(async () => {
          // Через <img>, а не через fetch: собственный протокол appimg://
          // (и file:// в браузере) картинку показывает, но fetch'ить нельзя.
          const img = await loadImageElement(displayUrl);
          if (!img) return { url: '', unsupported: true, note: 'Не удалось прочитать' };

          const sw = img.naturalWidth;
          const sh = img.naturalHeight;
          if (!sw || !sh) return { url: '', unsupported: true, note: 'Не удалось декодировать' };

          const scale = Math.min(1, bucket / Math.max(sw, sh));
          const w = Math.max(1, Math.round(sw * scale));
          const h = Math.max(1, Math.round(sh * scale));

          const resized = await drawToBlob(img, w, h);
          if (!resized) {
            // Не смогли уменьшить (старый движок) — отдаём оригинал
            return this.remember(key, displayUrl, 0, sw, sh, false);
          }
          const url = URL.createObjectURL(resized.blob);
          return this.remember(key, url, resized.blob.size, w, h, true);
        });
      } catch {
        return { url: '', unsupported: true, note: 'Не удалось декодировать' };
      }
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, task);
    return task;
  }

  private remember(
    key: string,
    url: string,
    bytes: number,
    width: number | undefined,
    height: number | undefined,
    revoke: boolean
  ): ThumbResult {
    const entry: CacheEntry = {
      url,
      bytes: bytes || (width && height ? width * height * 4 : 256 * 1024),
      width,
      height,
      lastUsed: Date.now(),
      revoke,
    };
    this.cache.set(key, entry);
    this.evictIfNeeded();
    return { url, width, height };
  }

  /** Прогрев строк, которые пользователь вот-вот увидит (overscan виртуального списка) */
  prefetch(assetId: ID, maxEdge: number): void {
    const key = this.key(assetId, bucketFor(maxEdge));
    if (this.cache.has(key) || this.inflight.has(key)) return;
    void this.resolve(assetId, maxEdge);
  }

  private withSlot<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active += 1;
        task().then(
          (v) => {
            this.active -= 1;
            this.pump();
            resolve(v);
          },
          (e) => {
            this.active -= 1;
            this.pump();
            reject(e);
          }
        );
      };
      this.queue.push(run);
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      job?.();
    }
  }

  private evictIfNeeded(): void {
    let bytes = 0;
    for (const entry of this.cache.values()) bytes += entry.bytes;
    if (bytes <= this.budgetBytes) return;

    const victims = [...this.cache.entries()]
      .filter(([, e]) => e.revoke)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    for (const [key, entry] of victims) {
      if (bytes <= this.budgetBytes * 0.8) break;
      if (entry.revoke && entry.url) URL.revokeObjectURL(entry.url);
      this.cache.delete(key);
      bytes -= entry.bytes;
    }
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      if (entry.revoke && entry.url) URL.revokeObjectURL(entry.url);
    }
    this.cache.clear();
  }
}

function extOfUrl(url: string): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const i = clean.lastIndexOf('.');
    return i >= 0 ? clean.slice(i + 1).toLowerCase() : '';
  } catch {
    return '';
  }
}

/** Загрузка картинки через <img> — работает с appimg://, blob:, http(s):, data: */
function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(null);
    }, 20000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.decoding = 'async';
    img.src = src;
  });
}

/** Уменьшение через OffscreenCanvas (с фолбэком на обычный canvas) */
async function drawToBlob(
  source: CanvasImageSource,
  w: number,
  h: number
): Promise<{ blob: Blob } | null> {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
      return { blob };
    }
  } catch {
    /* падаем в фолбэк ниже */
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.82)
    );
    return blob ? { blob } : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* React-хук                                                          */
/* ------------------------------------------------------------------ */

export function useThumb(
  service: ThumbService | null,
  assetId: ID | null,
  maxEdge = 192
): ThumbResult & { loading: boolean } {
  const [result, setResult] = useState<ThumbResult>({ url: '' });
  const [loading, setLoading] = useState(Boolean(assetId));

  useEffect(() => {
    let cancelled = false;
    if (!service || !assetId) {
      setResult({ url: '' });
      setLoading(false);
      return;
    }

    const instant = service.peek(assetId, maxEdge);
    if (instant) {
      setResult(instant);
      setLoading(false);
      return;
    }

    setLoading(true);
    service.resolve(assetId, maxEdge).then((r) => {
      if (cancelled) return;
      setResult(r);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [service, assetId, maxEdge]);

  return { ...result, loading };
}
