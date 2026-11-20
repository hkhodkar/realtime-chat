import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

export const sessionGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const result = await inject(SessionStore).verify();
  if (result === 'ok') return true;
  const queryParams: Record<string, string> = { redirect: state.url };
  if (result === 'taken') queryParams['reason'] = 'taken';
  return router.createUrlTree(['/join'], { queryParams });
};
