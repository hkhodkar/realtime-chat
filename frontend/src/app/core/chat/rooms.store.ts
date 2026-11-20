import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { apiErrorMessage } from '../api/api-error';
import { ChatApi } from '../api/chat-api';
import { Room, RoomCreate } from '../models/chat.models';
import { BROWSER_STORAGE, readJson, writeJson } from '../session/browser-storage';
import { SessionStore } from '../session/session.store';

type ReadCounts = Record<number, number>;

/**
 * The room list for the sidebar. Unread counts compare each room's message
 * count with the count the user had seen, stored per username in the browser.
 */
@Injectable({ providedIn: 'root' })
export class RoomsStore {
  private readonly api = inject(ChatApi);
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly session = inject(SessionStore);

  private readonly list = signal<Room[]>([]);
  private readonly readCounts = signal<ReadCounts>({});
  private loadedFor: string | null = null;

  readonly rooms = this.list.asReadonly();
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly activeRoomId = signal<number | null>(null);

  readonly unread = computed(() => {
    const seen = this.readCounts();
    const result: Record<number, number> = {};
    for (const room of this.list()) {
      result[room.id] = Math.max(0, room.message_count - (seen[room.id] ?? room.message_count));
    }
    return result;
  });
  readonly totalUnread = computed(() =>
    Object.values(this.unread()).reduce((sum, count) => sum + count, 0),
  );

  byName(name: string): Room | undefined {
    return this.list().find((room) => room.name === name);
  }

  byId(id: number | null): Room | undefined {
    return id === null ? undefined : this.list().find((room) => room.id === id);
  }

  async load(force = false): Promise<void> {
    const username = this.session.session()?.username ?? '';
    if (!force && this.loaded() && this.loadedFor === username) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rooms = await firstValueFrom(this.api.rooms());
      this.readCounts.set(readJson<ReadCounts>(this.storage, this.storageKey(), {}));
      this.list.set(rooms);
      // rooms seen for the first time start out read
      this.readCounts.update((counts) => {
        const next = { ...counts };
        for (const room of rooms) next[room.id] ??= room.message_count;
        return next;
      });
      this.loadedFor = username;
      this.loaded.set(true);
      this.markRead(this.activeRoomId());
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not load the rooms'));
    } finally {
      this.loading.set(false);
    }
  }

  /** A summary pushed over the socket: new message, presence change or new room. */
  upsert(room: Room): void {
    this.list.update((rooms) => {
      const index = rooms.findIndex((item) => item.id === room.id);
      if (index === -1) return [...rooms, room].sort((a, b) => a.id - b.id);
      const next = [...rooms];
      next[index] = room;
      return next;
    });
    const mine = room.last_message?.author === this.session.session()?.username;
    if (room.id === this.activeRoomId() || mine) {
      // your own messages (also from another tab) never count as unread
      this.markRead(room.id);
    } else if (this.readCounts()[room.id] === undefined) {
      this.setRead(room.id, 0);
    }
  }

  markRead(roomId: number | null): void {
    const room = this.byId(roomId);
    if (room && this.readCounts()[room.id] !== room.message_count) {
      this.setRead(room.id, room.message_count);
    }
  }

  create(payload: RoomCreate): Observable<Room> {
    return this.api.createRoom(payload).pipe(
      tap((room) => {
        this.setRead(room.id, room.message_count);
        this.upsert(room);
      }),
    );
  }

  private setRead(roomId: number, count: number): void {
    this.readCounts.update((counts) => ({ ...counts, [roomId]: count }));
    writeJson(this.storage, this.storageKey(), this.readCounts());
  }

  private storageKey(): string {
    const username = this.session.session()?.username.toLowerCase() ?? 'guest';
    return `realtime-chat.read.${username}`;
  }
}
