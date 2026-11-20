import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BROWSER_STORAGE } from '../session/browser-storage';
import { MockDb } from './mock-db';

/** Min and max delay of mock responses in ms, so loading states still show. */
export const MOCK_LATENCY = new InjectionToken<readonly [number, number]>('MOCK_LATENCY', {
  factory: () => [150, 300],
});

/** Where the mock database keeps its data (null keeps it in memory). */
export const MOCK_STORAGE = new InjectionToken<Storage | null>('MOCK_STORAGE', {
  factory: () => inject(BROWSER_STORAGE),
});

/**
 * Demo mode answers API calls and room sockets from an in-browser database
 * instead of the backend. It is always on in the demo build and switches on by
 * itself when no API is reachable.
 */
@Injectable({ providedIn: 'root' })
export class DemoMode {
  private readonly storage = inject(MOCK_STORAGE);
  private readonly enabled = signal(environment.demo);
  private readonly resets = signal(0);
  private database?: MockDb;

  readonly active = this.enabled.asReadonly();
  /** Goes up whenever the demo data was reset, in this tab or another one. */
  readonly revision = this.resets.asReadonly();

  get db(): MockDb {
    return (this.database ??= new MockDb(this.storage));
  }

  enable(): void {
    this.enabled.set(true);
  }

  reset(): void {
    this.db.reset();
    this.markReset();
  }

  markReset(): void {
    this.resets.update((value) => value + 1);
  }
}
