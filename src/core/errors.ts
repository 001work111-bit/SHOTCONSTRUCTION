/**
 * Typed domain errors. Every failure that can reach a user is represented here and
 * surfaced through the toast/status layer — never as a bare `console.error` (spec §80).
 */

export type AppErrorCode =
  | 'directory-unsupported'
  | 'directory-read-failed'
  | 'permission-denied'
  | 'unsupported-image'
  | 'missing-asset'
  | 'invalid-project'
  | 'invalid-json'
  | 'invalid-template'
  | 'no-eligible-images'
  | 'no-folders-selected'
  | 'no-catalog'
  | 'empty-pool'
  | 'corrupt-autosave'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;
  readonly hint?: string;

  constructor(code: AppErrorCode, message: string, options?: { detail?: string; hint?: string }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.detail = options?.detail;
    this.hint = options?.hint;
  }

  static from(err: unknown, fallbackCode: AppErrorCode = 'unknown'): AppError {
    if (err instanceof AppError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new AppError(fallbackCode, message || 'Unexpected error');
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError') === false
    ? err.name === 'AbortError'
    : err instanceof Error && err.name === 'AbortError';
}
