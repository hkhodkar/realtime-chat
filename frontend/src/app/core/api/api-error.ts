import { HttpErrorResponse } from '@angular/common/http';

interface ValidationIssue {
  msg?: string;
}

/** Turns a FastAPI error response into a sentence for the UI. */
export function apiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong, please try again',
): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Cannot reach the server. Check your connection.';
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    const msg = (detail[0] as ValidationIssue).msg;
    if (msg) return msg.replace(/^Value error, /, '');
  }
  return fallback;
}
