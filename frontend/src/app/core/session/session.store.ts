import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatApi } from '../api/chat-api';
import { ChatUser, Session } from '../models/chat.models';
import { BROWSER_STORAGE, readJson, writeJson } from './browser-storage';

const KEY = 'realtime-chat.session';

export type SessionCheck = 'ok' | 'missing' | 'taken';

/** The chat identity (username, color and token), remembered in localStorage. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ChatApi);
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly current = signal<Session | null>(
    readJson<Session | null>(this.storage, KEY, null),
  );
  private verified = false;

  readonly session = this.current.asReadonly();
  readonly user = computed<ChatUser | null>(() => {
    const session = this.current();
    return session ? { username: session.username, color: session.color } : null;
  });
  /** Last identity, also after leaving, to prefill the join form. */
  readonly lastUser = signal<ChatUser | null>(
    readJson<ChatUser | null>(this.storage, `${KEY}.last`, null),
  );

  get token(): string | null {
    return this.current()?.token ?? null;
  }

  save(session: Session): void {
    this.verified = true;
    this.current.set(session);
    this.lastUser.set({ username: session.username, color: session.color });
    writeJson(this.storage, KEY, session);
    writeJson(this.storage, `${KEY}.last`, this.lastUser());
  }

  clear(): void {
    this.verified = false;
    this.current.set(null);
    try {
      this.storage?.removeItem(KEY);
    } catch {
      // ignore
    }
  }

  /** Makes sure the stored session is still known to the server, re-joining if needed. */
  async verify(): Promise<SessionCheck> {
    const session = this.current();
    if (!session) return 'missing';
    if (this.verified) return 'ok';
    try {
      this.save(await firstValueFrom(this.api.session(session.token)));
      return 'ok';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return this.rejoin();
      // server hiccup: keep the session, the socket will tell us if it is gone
      return 'ok';
    }
  }

  /** The server forgot the session (restart, expiry): claim the same name again. */
  async rejoin(): Promise<SessionCheck> {
    const session = this.current();
    if (!session) return 'missing';
    try {
      this.save(
        await firstValueFrom(
          this.api.createSession({ username: session.username, color: session.color }),
        ),
      );
      return 'ok';
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 409 || error.status === 422)) {
        this.clear();
        return 'taken';
      }
      return 'ok';
    }
  }

  async leave(): Promise<void> {
    const token = this.token;
    this.clear();
    if (token) {
      await firstValueFrom(this.api.endSession(token)).catch(() => undefined);
    }
  }
}
