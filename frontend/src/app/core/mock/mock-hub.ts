import { Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  ChatUser,
  ClientEvent,
  MESSAGE_MAX_LENGTH,
  ServerEvent,
  textLength,
} from '../models/chat.models';
import { ConnectionStatus, RoomConnection, SocketEvent } from '../socket/room-connection';
import { BotCrew } from './bots';
import { DemoMode, MOCK_LATENCY } from './demo-mode';
import { randomToken } from './mock-db';

/** Whether the simulated teammates take part (switched off in unit tests). */
export const MOCK_BOTS = new InjectionToken<boolean>('MOCK_BOTS', { factory: () => true });

const CHANNEL = 'realtime-chat-demo';
const HEARTBEAT_MS = 10_000;

type ChannelMessage =
  { kind: 'event'; event: ServerEvent; roomId: number | null } | { kind: 'reset' };

/**
 * Stands in for the websocket server in demo mode. Events reach the other
 * tabs of the demo through a BroadcastChannel, and the shared state lives in
 * the mock database in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class MockHub implements OnDestroy {
  private readonly demo = inject(DemoMode);
  private readonly latency = inject(MOCK_LATENCY);
  private readonly botsEnabled = inject(MOCK_BOTS);
  private readonly connections = new Set<MockConnection>();
  private channel: BroadcastChannel | null = null;
  private crew: BotCrew | null = null;
  private readonly onPageHide = () => this.connections.forEach((c) => c.close());

  get db() {
    return this.demo.db;
  }

  connect(roomId: number, token: string): RoomConnection {
    this.start();
    const connection = new MockConnection(this, roomId, token, this.delay());
    this.connections.add(connection);
    return connection;
  }

  /** Delivers an event to this tab's sockets and to every other demo tab. */
  publish(event: ServerEvent, roomId: number | null, exclude?: MockConnection): void {
    this.deliver(event, roomId, exclude);
    this.post({ kind: 'event', event, roomId });
  }

  publishRoom(roomId: number): void {
    if (this.db.hasRoom(roomId)) {
      this.publish({ type: 'room_updated', room: this.db.room(roomId) }, null);
    }
  }

  postMessage(roomId: number, author: ChatUser, body: string): void {
    const message = this.db.addMessage(roomId, author, body);
    this.publish({ type: 'message', message }, roomId);
    this.publishRoom(roomId);
  }

  /** Resets the demo data here and tells the other tabs to reload. */
  reset(): void {
    this.demo.reset();
    this.post({ kind: 'reset' });
  }

  /** Rooms that have a socket open in this tab. */
  localRooms(): number[] {
    return [...this.connections].map((connection) => connection.roomId);
  }

  forget(connection: MockConnection): void {
    this.connections.delete(connection);
  }

  ngOnDestroy(): void {
    this.connections.forEach((connection) => connection.close());
    this.crew?.stop();
    this.channel?.close();
    globalThis.removeEventListener?.('pagehide', this.onPageHide);
  }

  private start(): void {
    if (this.channel || typeof BroadcastChannel === 'undefined') {
      this.startCrew();
      return;
    }
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = ({ data }: MessageEvent<ChannelMessage>) => {
      if (data?.kind === 'event') this.deliver(data.event, data.roomId);
      if (data?.kind === 'reset') this.demo.markReset();
    };
    globalThis.addEventListener?.('pagehide', this.onPageHide);
    this.startCrew();
  }

  private startCrew(): void {
    if (this.botsEnabled && !this.crew) {
      this.crew = new BotCrew(this);
      this.crew.start();
    }
  }

  private deliver(event: ServerEvent, roomId: number | null, exclude?: MockConnection): void {
    for (const connection of this.connections) {
      if (connection !== exclude && (roomId === null || connection.roomId === roomId)) {
        connection.receive(event);
      }
    }
    this.crew?.observe(event, roomId);
  }

  private post(message: ChannelMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // channel closed while the page unloads
    }
  }

  private delay(): number {
    const [min, max] = this.latency;
    return min + Math.random() * (max - min);
  }
}

export class MockConnection implements RoomConnection {
  private readonly state = signal<ConnectionStatus>('connecting');
  private readonly subject = new Subject<SocketEvent>();
  private readonly id = randomToken();
  private user: ChatUser | null = null;
  private startTimer: ReturnType<typeof setTimeout>;
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  readonly status = this.state.asReadonly();
  readonly retryAt = signal<number | null>(null).asReadonly();
  readonly events = this.subject.asObservable();

  constructor(
    private readonly hub: MockHub,
    readonly roomId: number,
    private readonly token: string,
    delay: number,
  ) {
    this.startTimer = setTimeout(() => this.start(), delay);
  }

  send(event: ClientEvent): boolean {
    if (this.state() !== 'open' || !this.user) return false;
    if (event.type === 'typing') {
      const typing = {
        type: 'typing' as const,
        username: this.user.username,
        active: event.active,
      };
      this.hub.publish(typing, this.roomId, this);
      return true;
    }
    const body = event.body.trim();
    if (!body || textLength(body) > MESSAGE_MAX_LENGTH) {
      const detail = body
        ? `String should have at most ${MESSAGE_MAX_LENGTH} characters`
        : 'String should have at least 1 character';
      setTimeout(() => this.receive({ type: 'error', detail }));
      return true;
    }
    this.hub.postMessage(this.roomId, this.user, body);
    return true;
  }

  retryNow(): void {
    // the in-browser hub never drops the connection
  }

  close(): void {
    if (this.state() === 'closed') return;
    clearTimeout(this.startTimer);
    clearInterval(this.heartbeat);
    const wasOpen = this.state() === 'open';
    this.state.set('closed');
    this.hub.forget(this);
    if (wasOpen && this.user) {
      const db = this.hub.db;
      db.dropPresence(this.id);
      const user = this.user;
      // another tab of the same person keeps them in the room
      if (!db.online(this.roomId).some((u) => u.username === user.username)) {
        this.hub.publish({ type: 'leave', user, at: new Date().toISOString() }, this.roomId);
        this.hub.publishRoom(this.roomId);
      }
    }
    this.subject.complete();
  }

  receive(event: ServerEvent): void {
    if (this.state() === 'open') this.subject.next(event);
  }

  private start(): void {
    const db = this.hub.db;
    const session = db.session(this.token);
    if (!session) {
      this.state.set('closed');
      this.subject.next({ type: 'session_expired' });
      return;
    }
    if (!db.hasRoom(this.roomId)) {
      this.state.set('closed');
      this.subject.next({ type: 'room_missing' });
      return;
    }
    const user = { username: session.username, color: session.color };
    this.user = user;
    const alreadyHere = db.online(this.roomId).some((u) => u.username === user.username);
    const touch = () =>
      db.touchPresence(this.id, { ...user, token: this.token, room_id: this.roomId });
    touch();
    this.heartbeat = setInterval(touch, HEARTBEAT_MS);

    this.state.set('open');
    this.subject.next({ type: 'connected', reconnect: false });
    this.subject.next({ type: 'presence', users: db.online(this.roomId) });
    if (!alreadyHere) {
      this.hub.publish({ type: 'join', user, at: new Date().toISOString() }, this.roomId, this);
      this.hub.publishRoom(this.roomId);
    }
  }
}
