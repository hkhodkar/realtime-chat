import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionStore } from './session.store';

/** Sends the chat session token with API calls that need an author. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(SessionStore).token;
  if (!token || !req.url.startsWith('/api/') || req.headers.has('X-Session-Token')) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-Session-Token': token } }));
};
