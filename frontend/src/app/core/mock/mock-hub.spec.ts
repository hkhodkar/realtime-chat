import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, filter, take, toArray } from 'rxjs';
import { RoomConnection, SocketEvent } from '../socket/room-connection';
import { DemoMode, MOCK_LATENCY, MOCK_STORAGE } from './demo-mode';
import { MOCK_BOTS, MockHub } from './mock-hub';

/** A localStorage stand-in that two "tabs" can share. */
class SharedStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

function nextEvent(connection: RoomConnection, type: SocketEvent['type']): Promise<SocketEvent> {
  return firstValueFrom(connection.events.pipe(filter((event) => event.type === type)));
}

describe('MockHub', () => {
  let storage: SharedStorage;
  let hub: MockHub;
  let demo: DemoMode;

  const providers = () => [
    { provide: MOCK_LATENCY, useValue: [0, 0] },
    { provide: MOCK_STORAGE, useValue: storage },
    { provide: MOCK_BOTS, useValue: false },
  ];

  beforeEach(() => {
    storage = new SharedStorage();
    TestBed.configureTestingModule({ providers: providers() });
    hub = TestBed.inject(MockHub);
    demo = TestBed.inject(DemoMode);
  });

  const session = (username: string) => demo.db.createSession({ username, color: '#2563eb' }).token;

  it('opens with a presence snapshot that includes the demo teammates', async () => {
    const connection = hub.connect(1, session('alex'));
    const events = firstValueFrom(connection.events.pipe(take(2), toArray()));

    const [connected, presence] = await events;
    expect(connected).toEqual({ type: 'connected', reconnect: false });
    expect(presence).toEqual({
      type: 'presence',
      users: [
        { username: 'alex', color: '#2563eb' },
        { username: 'Leo', color: '#d93f3f' },
        { username: 'Maya', color: '#b7791f' },
      ],
    });
    expect(connection.status()).toBe('open');
    connection.close();
  });

  it('reports an unknown session like the server close code', async () => {
    const connection = hub.connect(1, 'nope');
    expect(await nextEvent(connection, 'session_expired')).toEqual({ type: 'session_expired' });
    expect(connection.status()).toBe('closed');
  });

  it('broadcasts messages, joins and typing to the room', async () => {
    const first = hub.connect(2, session('alex'));
    await nextEvent(first, 'presence');
    const joined = nextEvent(first, 'join');
    const second = hub.connect(2, session('sara'));
    await nextEvent(second, 'presence');
    expect(await joined).toMatchObject({ user: { username: 'sara' } });

    const typing = nextEvent(first, 'typing');
    second.send({ type: 'typing', active: true });
    expect(await typing).toEqual({ type: 'typing', username: 'sara', active: true });

    const received = nextEvent(first, 'message');
    const summary = firstValueFrom(
      first.events.pipe(filter((e) => e.type === 'room_updated' && !!e.room.last_message)),
    );
    expect(second.send({ type: 'message', body: '  Deploy is green 🚀 ' })).toBe(true);
    expect(await received).toMatchObject({
      message: { author: 'sara', body: 'Deploy is green 🚀' },
    });
    expect(await summary).toMatchObject({
      room: { id: 2, last_message: { body: 'Deploy is green 🚀' } },
    });
    expect(demo.db.messages(2, { before: null, after: null, limit: 1 }).items[0].body).toBe(
      'Deploy is green 🚀',
    );

    const left = nextEvent(first, 'leave');
    second.close();
    expect(await left).toMatchObject({ user: { username: 'sara' } });
    first.close();
  });

  it('rejects messages over the limit with an error event', async () => {
    const connection = hub.connect(1, session('alex'));
    await nextEvent(connection, 'presence');
    const error = nextEvent(connection, 'error');
    connection.send({ type: 'message', body: 'x'.repeat(1001) });
    expect(await error).toMatchObject({ detail: 'String should have at most 1000 characters' });
    connection.close();
  });

  it('lets two tabs talk through a BroadcastChannel', async () => {
    // a second "tab": its own hub and DemoMode, sharing only the storage
    const otherTab = createEnvironmentInjector(
      [...providers(), MockHub, DemoMode],
      TestBed.inject(EnvironmentInjector),
    );
    const otherHub = otherTab.get(MockHub);
    const token = session('alex');

    const here = hub.connect(5, token);
    await nextEvent(here, 'presence');
    const there = otherHub.connect(5, session('sara'));
    await nextEvent(there, 'presence');

    const received = nextEvent(there, 'message');
    here.send({ type: 'message', body: 'hello other tab' });
    expect(await received).toMatchObject({ message: { author: 'alex', body: 'hello other tab' } });

    here.close();
    otherTab.destroy();
  });
});
