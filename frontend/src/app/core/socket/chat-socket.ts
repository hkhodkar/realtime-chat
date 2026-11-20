import { DOCUMENT, Injectable, InjectionToken, inject } from '@angular/core';
import { DemoMode } from '../mock/demo-mode';
import { MockHub } from '../mock/mock-hub';
import { RoomConnection } from './room-connection';
import { WebSocketConnection, WebSocketFactory } from './websocket-connection';

export const WEBSOCKET_FACTORY = new InjectionToken<WebSocketFactory>('WEBSOCKET_FACTORY', {
  factory: () => (url: string) => new WebSocket(url),
});

/** Opens room sockets against the API, or against the in-browser hub in demo mode. */
@Injectable({ providedIn: 'root' })
export class ChatSocket {
  private readonly demo = inject(DemoMode);
  private readonly hub = inject(MockHub);
  private readonly document = inject(DOCUMENT);
  private readonly factory = inject(WEBSOCKET_FACTORY);

  connect(roomId: number, token: string): RoomConnection {
    if (this.demo.active()) {
      return this.hub.connect(roomId, token);
    }
    const { protocol, host } = this.document.location;
    const scheme = protocol === 'https:' ? 'wss' : 'ws';
    const url = `${scheme}://${host}/api/rooms/${roomId}/ws?token=${encodeURIComponent(token)}`;
    return new WebSocketConnection(url, this.factory);
  }
}
