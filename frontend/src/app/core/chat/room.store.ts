import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../api/api-error';
import { ChatApi } from '../api/chat-api';
import { ChatUser, Message } from '../models/chat.models';
import { SessionStore } from '../session/session.store';
import { ChatSocket } from '../socket/chat-socket';
import { RoomConnection, SocketEvent } from '../socket/room-connection';
import { RoomsStore } from './rooms.store';
import { SystemNote, buildTimeline, mergeMessages, typingLabel } from './timeline';

const PAGE_SIZE = 30;
/** Send "typing" at most this often while the user keeps typing. */
const TYPING_THROTTLE_MS = 2500;
/** Stop "typing" after this much silence. */
const TYPING_IDLE_MS = 3000;
/** Drop someone's typing indicator if no refresh arrives in time. */
const TYPING_EXPIRY_MS = 6000;

/** State of the room on screen: history, live socket, presence and typing. */
@Injectable()
export class RoomStore implements OnDestroy {
  private readonly api = inject(ChatApi);
  private readonly socket = inject(ChatSocket);
  private readonly session = inject(SessionStore);
  private readonly rooms = inject(RoomsStore);
  private readonly router = inject(Router);

  private readonly roomId = signal<number | null>(null);
  private readonly messageList = signal<Message[]>([]);
  private readonly notes = signal<SystemNote[]>([]);
  private readonly typingUsers = signal<string[]>([]);
  private readonly connection = signal<RoomConnection | null>(null);
  private subscription?: Subscription;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private typingSentAt = 0;
  private typingIdle: ReturnType<typeof setTimeout> | undefined;
  private noteSeq = 0;

  readonly room = computed(() => this.rooms.byId(this.roomId()) ?? null);
  readonly messages = this.messageList.asReadonly();
  readonly online = signal<ChatUser[]>([]);
  readonly hasMore = signal(false);
  readonly loading = signal(false);
  readonly loadingOlder = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly timeline = computed(() => buildTimeline(this.messageList(), this.notes()));
  readonly typing = computed(() => typingLabel(this.typingUsers()));
  readonly status = computed(() => this.connection()?.status() ?? 'connecting');
  readonly retryAt = computed(() => this.connection()?.retryAt() ?? null);

  open(roomId: number): void {
    if (roomId === this.roomId()) return;
    this.disconnect();
    this.roomId.set(roomId);
    this.messageList.set([]);
    this.notes.set([]);
    this.online.set([]);
    this.hasMore.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.clearTyping();
    void this.loadLatest(roomId);
    this.connect(roomId);
  }

  /** Reloads everything, e.g. after the demo data was reset. */
  reload(): void {
    const id = this.roomId();
    this.roomId.set(null);
    if (id !== null) this.open(id);
  }

  async loadOlder(): Promise<void> {
    const roomId = this.roomId();
    const oldest = this.messageList()[0];
    if (roomId === null || !oldest || !this.hasMore() || this.loadingOlder()) return;
    this.loadingOlder.set(true);
    try {
      const page = await firstValueFrom(
        this.api.messages(roomId, { before: oldest.id, limit: PAGE_SIZE }),
      );
      if (roomId !== this.roomId()) return;
      this.messageList.update((list) => mergeMessages(list, page.items));
      this.hasMore.set(page.has_more);
    } catch (error) {
      this.notice.set(apiErrorMessage(error, 'Could not load older messages'));
    } finally {
      this.loadingOlder.set(false);
    }
  }

  send(body: string): boolean {
    const text = body.trim();
    if (!text) return false;
    const sent = this.connection()?.send({ type: 'message', body: text }) ?? false;
    if (sent) this.stopTyping();
    return sent;
  }

  /** Called on every keystroke in the composer. */
  notifyTyping(): void {
    const now = Date.now();
    if (now - this.typingSentAt > TYPING_THROTTLE_MS) {
      if (this.connection()?.send({ type: 'typing', active: true })) this.typingSentAt = now;
    }
    clearTimeout(this.typingIdle);
    this.typingIdle = setTimeout(() => this.stopTyping(), TYPING_IDLE_MS);
  }

  stopTyping(): void {
    clearTimeout(this.typingIdle);
    if (this.typingSentAt) {
      this.typingSentAt = 0;
      this.connection()?.send({ type: 'typing', active: false });
    }
  }

  retryNow(): void {
    this.connection()?.retryNow();
  }

  dismissNotice(): void {
    this.notice.set(null);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private async loadLatest(roomId: number, after?: number): Promise<void> {
    if (after === undefined) this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.messages(
          roomId,
          after === undefined ? { limit: PAGE_SIZE } : { after, limit: 100 },
        ),
      );
      if (roomId !== this.roomId()) return;
      this.messageList.update((list) => mergeMessages(list, page.items));
      if (after === undefined) this.hasMore.set(page.has_more);
    } catch (error) {
      if (roomId === this.roomId()) {
        this.error.set(apiErrorMessage(error, 'Could not load the messages'));
      }
    } finally {
      if (after === undefined) this.loading.set(false);
    }
  }

  private connect(roomId: number): void {
    const token = this.session.token;
    if (!token) return;
    const connection = this.socket.connect(roomId, token);
    this.connection.set(connection);
    this.subscription = connection.events.subscribe((event) => this.handle(roomId, event));
  }

  private disconnect(): void {
    this.stopTyping();
    this.subscription?.unsubscribe();
    this.connection()?.close();
    this.connection.set(null);
    this.clearTyping();
  }

  private handle(roomId: number, event: SocketEvent): void {
    const me = this.session.session()?.username;
    switch (event.type) {
      case 'connected':
        this.error.set(null);
        if (event.reconnect) {
          // catch up on what was said while the socket was down
          const last = this.messageList().at(-1);
          void this.loadLatest(roomId, last?.id ?? 0);
        }
        break;
      case 'presence':
        this.online.set(event.users);
        break;
      case 'join':
        this.online.update((users) =>
          users.some((user) => user.username === event.user.username)
            ? users
            : [...users, event.user].sort((a, b) => a.username.localeCompare(b.username)),
        );
        this.addNote(`${event.user.username} joined the room`, event.at);
        break;
      case 'leave':
        this.online.update((users) =>
          users.filter((user) => user.username !== event.user.username),
        );
        this.setTyping(event.user.username, false);
        this.addNote(`${event.user.username} left the room`, event.at);
        break;
      case 'message':
        if (event.message.room_id !== roomId) return;
        this.messageList.update((list) => mergeMessages(list, [event.message]));
        this.setTyping(event.message.author, false);
        break;
      case 'typing':
        if (event.username !== me) this.setTyping(event.username, event.active);
        break;
      case 'room_updated':
        this.rooms.upsert(event.room);
        break;
      case 'error':
        this.notice.set(event.detail);
        break;
      case 'session_expired':
        void this.recoverSession(roomId);
        break;
      case 'room_missing':
        this.error.set('This room does not exist anymore.');
        break;
    }
  }

  private async recoverSession(roomId: number): Promise<void> {
    const result = await this.session.rejoin();
    if (roomId !== this.roomId()) return;
    if (result === 'ok') {
      this.disconnect();
      this.connect(roomId);
    } else {
      this.disconnect();
      void this.router.navigate(['/join'], { queryParams: { reason: 'taken' } });
    }
  }

  private addNote(text: string, at: string): void {
    this.notes.update((notes) => [...notes, { id: `note-${++this.noteSeq}`, text, at }]);
  }

  private setTyping(username: string, active: boolean): void {
    clearTimeout(this.typingTimers.get(username));
    this.typingTimers.delete(username);
    if (active) {
      this.typingTimers.set(
        username,
        setTimeout(() => this.setTyping(username, false), TYPING_EXPIRY_MS),
      );
      if (!this.typingUsers().includes(username)) {
        this.typingUsers.update((names) => [...names, username]);
      }
    } else if (this.typingUsers().includes(username)) {
      this.typingUsers.update((names) => names.filter((name) => name !== username));
    }
  }

  private clearTyping(): void {
    this.typingTimers.forEach((timer) => clearTimeout(timer));
    this.typingTimers.clear();
    this.typingUsers.set([]);
  }
}
