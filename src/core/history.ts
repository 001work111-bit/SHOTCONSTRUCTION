import type { Project } from './types';

/**
 * HistoryManager (spec §45–47).
 *
 * Snapshot based: every user operation stores the project as it was *before* the change.
 * Immutable updates + structural sharing keep this cheap even with 100k assets
 * (only the changed slice is a new object; unchanged assets/folders are shared).
 *
 * Atomicity: one operation = one entry, so `Randomize All` touching 15 blocks is undone
 * by a single Ctrl+Z.
 */

export interface HistoryEntry {
  label: string;
  project: Project;
  at: number;
}

export interface HistorySnapshot {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  depth: number;
  limit: number;
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private limit: number;

  constructor(limit = 120) {
    this.limit = Math.max(10, limit);
  }

  setLimit(limit: number): void {
    this.limit = Math.max(10, limit);
    this.trim();
  }

  /** Record the *previous* project under a human readable label. */
  push(previous: Project, label: string): void {
    this.undoStack.push({ label, project: previous, at: Date.now() });
    this.redoStack = [];
    this.trim();
  }

  undo(current: Project): { project: Project; label: string } | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ label: entry.label, project: current, at: Date.now() });
    return { project: entry.project, label: entry.label };
  }

  redo(current: Project): { project: Project; label: string } | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ label: entry.label, project: current, at: Date.now() });
    return { project: entry.project, label: entry.label };
  }

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get depth(): number {
    return this.undoStack.length;
  }

  snapshot(): HistorySnapshot {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : null,
      redoLabel: this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : null,
      depth: this.undoStack.length,
      limit: this.limit,
    };
  }

  private trim(): void {
    while (this.undoStack.length > this.limit) this.undoStack.shift();
  }
}
