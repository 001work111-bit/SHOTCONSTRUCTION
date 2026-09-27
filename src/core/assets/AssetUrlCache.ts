/** LRU-ish cache for object URLs to avoid unbounded memory growth */

interface CacheEntry {
  url: string;
  lastUsed: number;
  refCount: number;
}

export class AssetUrlCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;

  constructor(maxEntries = 120) {
    this.maxEntries = maxEntries;
  }

  get(key: string): string | null {
    const e = this.cache.get(key);
    if (!e) return null;
    e.lastUsed = Date.now();
    return e.url;
  }

  set(key: string, url: string): void {
    const existing = this.cache.get(key);
    if (existing) {
      if (existing.url !== url) {
        URL.revokeObjectURL(existing.url);
      }
      existing.url = url;
      existing.lastUsed = Date.now();
      return;
    }
    this.cache.set(key, { url, lastUsed: Date.now(), refCount: 0 });
    this.evict();
  }

  retain(key: string): void {
    const e = this.cache.get(key);
    if (e) e.refCount++;
  }

  release(key: string): void {
    const e = this.cache.get(key);
    if (e) e.refCount = Math.max(0, e.refCount - 1);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  private evict() {
    if (this.cache.size <= this.maxEntries) return;
    const entries = Array.from(this.cache.entries())
      .filter(([, e]) => e.refCount === 0)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toRemove = this.cache.size - this.maxEntries;
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const [key, e] = entries[i];
      URL.revokeObjectURL(e.url);
      this.cache.delete(key);
    }
  }

  clear() {
    for (const e of this.cache.values()) {
      URL.revokeObjectURL(e.url);
    }
    this.cache.clear();
  }
}

export const assetUrlCache = new AssetUrlCache();
