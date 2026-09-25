/** Atomic undo/redo history manager */

export type Snapshot<T> = T;

export class HistoryManager<T> {
  private past: Snapshot<T>[] = [];
  private future: Snapshot<T>[] = [];
  private maxSize: number;
  private clone: (state: T) => T;

  constructor(cloneFn: (state: T) => T, maxSize = 80) {
    this.clone = cloneFn;
    this.maxSize = maxSize;
  }

  push(current: T): void {
    this.past.push(this.clone(current));
    if (this.past.length > this.maxSize) {
      this.past.shift();
    }
    this.future = [];
  }

  undo(current: T): T | null {
    if (this.past.length === 0) return null;
    const prev = this.past.pop()!;
    this.future.push(this.clone(current));
    return prev;
  }

  redo(current: T): T | null {
    if (this.future.length === 0) return null;
    const next = this.future.pop()!;
    this.past.push(this.clone(current));
    return next;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }

  get sizes() {
    return { past: this.past.length, future: this.future.length };
  }
}
