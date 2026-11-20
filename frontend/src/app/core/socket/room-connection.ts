import { Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ClientEvent, ServerEvent } from '../models/chat.models';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Server events plus what the connection itself has to report. */
export type SocketEvent =
  | ServerEvent
  | { type: 'connected'; reconnect: boolean }
  | { type: 'session_expired' }
  | { type: 'room_missing' };

/** A live link to one room, the same for the real socket and the demo mock. */
export interface RoomConnection {
  readonly status: Signal<ConnectionStatus>;
  /** Timestamp of the next reconnect attempt while reconnecting. */
  readonly retryAt: Signal<number | null>;
  readonly events: Observable<SocketEvent>;
  send(event: ClientEvent): boolean;
  retryNow(): void;
  close(): void;
}
