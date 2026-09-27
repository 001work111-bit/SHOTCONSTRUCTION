import type { Project } from '../core/types';
import { IDB_KEYS, idbDelete, idbGet, idbSet } from '../filesystem/idb';
import { serializeProject } from './serializer';

/**
 * Autosave (spec §50). Local crash-recovery snapshot in IndexedDB.
 * It is explicitly *not* a replacement for `Export project` — the exported JSON stays
 * the source of truth and the only portable artifact.
 */

export interface AutosaveSnapshot {
  savedAt: number;
  project: Project;
}

export interface AutosaveOptions {
  delayMs?: number;
  onStatus?: (status: 'saving' | 'saved' | 'error', detail?: string) => void;
}

export class AutosaveService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private delayMs: number;
  private onStatus: AutosaveOptions['onStatus'];
  private lastSerialized: string | null = null;

  constructor(options: AutosaveOptions = {}) {
    this.delayMs = options.delayMs ?? 1200;
    this.onStatus = options.onStatus;
  }

  /** Called on every project change; the write itself is debounced. */
  schedule(project: Project): void {
    if (this.timer) clearTimeout(this.timer);
    this.onStatus?.('saving');
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush(project);
    }, this.delayMs);
  }

  async flush(project: Project): Promise<void> {
    try {
      const payload = serializeProject(project);
      const json = JSON.stringify(payload);
      if (json === this.lastSerialized) {
        this.onStatus?.('saved');
        return;
      }
      const ok = await idbSet(IDB_KEYS.autosave, { savedAt: Date.now(), project: payload } satisfies AutosaveSnapshot);
      this.lastSerialized = json;
      this.onStatus?.(ok ? 'saved' : 'error', ok ? undefined : 'IndexedDB is unavailable');
    } catch (err) {
      this.onStatus?.('error', err instanceof Error ? err.message : String(err));
    }
  }

  async restore(): Promise<AutosaveSnapshot | null> {
    const snapshot = await idbGet<AutosaveSnapshot>(IDB_KEYS.autosave);
    if (!snapshot?.project) return null;
    return snapshot;
  }

  async clear(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.lastSerialized = null;
    await idbDelete(IDB_KEYS.autosave);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
