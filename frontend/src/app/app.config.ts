import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { mockApiInterceptor } from './core/mock/mock-api.interceptor';
import { sessionInterceptor } from './core/session/session.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([sessionInterceptor, mockApiInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
  ],
};
