import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ClientEvent, ServerEvent } from '../models/chat.models';
import { reconnectDelay } from './backoff';
import { ConnectionStatus, RoomConnection, SocketEvent } from './room-connection';

export type WebSocketFactory = (url: string) => WebSocket;

// close codes sent by the API, see backend/app/routers/ws.py
const SESSION_EXPIRED = 4401;
const ROOM_NOT_FOUND = 4404;

/** A room socket that reconnects with backoff until it is closed on purpose. */
export class WebSocketConnection implements RoomConnection {
  private readonly state = signal<ConnectionStatus>('connecting');
  private readonly nextRetry = signal<number | null>(null);
  private readonly subject = new Subject<SocketEvent>();
  private socket: WebSocket | null = null;
  private attempt = 0;
  private opened = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly onOnline = () => this.retryNow();

  readonly status = this.state.asReadonly();
  readonly retryAt = this.nextRetry.asReadonly();
  readonly events = this.subject.asObservable();

  constructor(
    private readonly url: string,
    private readonly createSocket: WebSocketFactory = (url) => new WebSocket(url),
    private readonly delay: (attempt: number) => number = reconnectDelay,
  ) {
    globalThis.addEventListener?.('online', this.onOnline);
    this.open();
  }

  send(event: ClientEvent): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(event));
    return true;
  }

  retryNow(): void {
    if (this.stopped || this.state() !== 'reconnecting') return;
    clearTimeout(this.timer);
    this.open();
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    globalThis.removeEventListener?.('online', this.onOnline);
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
    this.state.set('closed');
    this.nextRetry.set(null);
    this.subject.complete();
  }

  private open(): void {
    this.nextRetry.set(null);
    this.state.set(this.attempt > 0 ? 'reconnecting' : 'connecting');
    const socket = this.createSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.state.set('open');
      this.subject.next({ type: 'connected', reconnect: this.opened });
      this.opened = true;
    };
    socket.onmessage = (message: MessageEvent) => {
      try {
        this.subject.next(JSON.parse(String(message.data)) as ServerEvent);
      } catch {
        // not ours, ignore
      }
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;
      if (event.code === SESSION_EXPIRED || event.code === ROOM_NOT_FOUND) {
        this.state.set('closed');
        this.subject.next({
          type: event.code === SESSION_EXPIRED ? 'session_expired' : 'room_missing',
        });
        return;
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    const wait = this.delay(this.attempt++);
    this.state.set('reconnecting');
    this.nextRetry.set(Date.now() + wait);
    this.timer = setTimeout(() => this.open(), wait);
  }
}
