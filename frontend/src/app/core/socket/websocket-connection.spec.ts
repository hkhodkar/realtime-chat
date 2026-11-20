import { firstValueFrom, take, toArray } from 'rxjs';
import { reconnectDelay } from './backoff';
import { SocketEvent } from './room-connection';
import { WebSocketConnection } from './websocket-connection';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

describe('reconnectDelay', () => {
  it('doubles up to a cap, with jitter', () => {
    const middle = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 10].map((n) => reconnectDelay(n, middle))).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000, 15000,
    ]);
    expect(reconnectDelay(0, () => 0)).toBe(800);
    expect(reconnectDelay(0, () => 1)).toBe(1200);
  });
});

describe('WebSocketConnection', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', { OPEN: 1 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const create = () =>
    new WebSocketConnection(
      'ws://test/api/rooms/1/ws',
      (url) => new FakeSocket(url) as unknown as WebSocket,
      (n) => 1000 * 2 ** n,
    );
  const latest = () => FakeSocket.instances.at(-1)!;

  it('connects, relays server events and sends JSON', async () => {
    const connection = create();
    const events = firstValueFrom(connection.events.pipe(take(2), toArray()));
    expect(connection.status()).toBe('connecting');
    expect(connection.send({ type: 'typing', active: true })).toBe(false);

    latest().open();
    latest().receive({ type: 'typing', username: 'sara', active: true });

    expect(await events).toEqual<SocketEvent[]>([
      { type: 'connected', reconnect: false },
      { type: 'typing', username: 'sara', active: true },
    ]);
    expect(connection.status()).toBe('open');
    expect(connection.send({ type: 'message', body: 'hi' })).toBe(true);
    expect(latest().sent).toEqual(['{"type":"message","body":"hi"}']);
    connection.close();
  });

  it('reconnects with growing delays and reports the reconnect', async () => {
    const connection = create();
    latest().open();
    const reconnected = firstValueFrom(connection.events.pipe(take(1)));

    latest().drop();
    expect(connection.status()).toBe('reconnecting');
    expect(connection.retryAt()).toBe(Date.now() + 1000);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);

    latest().drop();
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);

    latest().open();
    expect(await reconnected).toEqual({ type: 'connected', reconnect: true });
    expect(connection.status()).toBe('open');
    connection.close();
  });

  it('can retry right away', () => {
    const connection = create();
    latest().drop();
    connection.retryNow();
    expect(FakeSocket.instances).toHaveLength(2);
    connection.close();
  });

  it('stops on an expired session instead of retrying', async () => {
    const connection = create();
    const event = firstValueFrom(connection.events);
    latest().drop(4401);
    expect(await event).toEqual({ type: 'session_expired' });
    expect(connection.status()).toBe('closed');
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('does not reconnect after close', () => {
    const connection = create();
    latest().open();
    connection.close();
    latest().drop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(connection.status()).toBe('closed');
  });
});
