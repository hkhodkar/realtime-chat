import { Message, Room } from '../models/chat.models';
import { handleMockRequest } from './mock-api';
import { MockDb, PRESENCE_TTL_MS } from './mock-db';

describe('mock API', () => {
  let now: number;
  let db: MockDb;

  const call = (method: string, url: string, body: unknown = null, token: string | null = null) =>
    handleMockRequest(db, method, url, body, token);

  const join = (username = 'alex', color = '#2563eb') =>
    call('POST', '/api/sessions', { username, color }).body as { token: string };

  beforeEach(() => {
    now = Date.parse('2026-11-20T12:00:00Z');
    db = new MockDb(null, undefined, () => now);
  });

  it('lists the seeded rooms like the backend', () => {
    const rooms = call('GET', '/api/rooms').body as Room[];

    expect(rooms.map((room) => room.name)).toEqual([
      'general',
      'frontend',
      'backend',
      'design',
      'random',
    ]);
    expect(rooms[0].message_count).toBe(43);
    expect(rooms[0].last_message?.body).toBe('Done ✅');
    // the two demo teammates are always online
    expect(rooms[0].online_count).toBe(2);
  });

  it('pages back through history with before and returns oldest first', () => {
    const latest = call('GET', '/api/rooms/1/messages?limit=30').body as {
      items: Message[];
      has_more: boolean;
    };
    expect(latest.items).toHaveLength(30);
    expect(latest.has_more).toBe(true);
    expect(latest.items[0].id).toBeLessThan(latest.items[29].id);

    const older = call('GET', `/api/rooms/1/messages?before=${latest.items[0].id}&limit=30`)
      .body as {
      items: Message[];
      has_more: boolean;
    };
    expect(older.items).toHaveLength(13);
    expect(older.has_more).toBe(false);
    expect(older.items[0].body).toMatch(/^Morning all/);
  });

  it('validates paging parameters', () => {
    expect(call('GET', '/api/rooms/1/messages?limit=0').status).toBe(422);
    expect(call('GET', '/api/rooms/1/messages?before=3&after=1').status).toBe(422);
    expect(call('GET', '/api/rooms/99/messages').status).toBe(404);
  });

  it('creates rooms with the same rules as the API', () => {
    const { token } = join();

    const created = call(
      'POST',
      '/api/rooms',
      { name: ' Release-Notes ', description: '  ' },
      token,
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'release-notes',
      description: null,
      created_by: 'alex',
    });
    expect(created.effects?.[0].event.type).toBe('room_updated');

    expect(call('POST', '/api/rooms', { name: 'general' }, token).status).toBe(409);
    expect(call('POST', '/api/rooms', { name: 'no spaces' }, token).status).toBe(422);
    expect(call('POST', '/api/rooms', { name: 'x' }, token).status).toBe(422);
    expect(
      call('POST', '/api/rooms', { name: 'ok', description: 'd'.repeat(141) }, token).status,
    ).toBe(422);
    expect(call('POST', '/api/rooms', { name: 'ok' }).status).toBe(401);
  });

  it('posts messages and reports what to broadcast', () => {
    const { token } = join('maria', '#db2777');

    const response = call('POST', '/api/rooms/4/messages', { body: ' Looks great 🎉 ' }, token);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      author: 'maria',
      color: '#db2777',
      body: 'Looks great 🎉',
    });
    expect(response.effects?.map((effect) => effect.event.type)).toEqual([
      'message',
      'room_updated',
    ]);
    expect((call('GET', '/api/rooms/4').body as Room).message_count).toBe(13);
    expect(call('POST', '/api/rooms/4/messages', { body: 'x'.repeat(1001) }, token).status).toBe(
      422,
    );
    // emoji count once, like on the server
    expect(call('POST', '/api/rooms/4/messages', { body: '🙂'.repeat(1000) }, token).status).toBe(
      201,
    );
  });

  it('keeps usernames unique among online people', () => {
    const first = join('Sara');

    expect(call('POST', '/api/sessions', { username: 'sara', color: '#2563eb' }).status).toBe(409);
    expect(call('POST', '/api/sessions', { username: 'maya', color: '#2563eb' }).status).toBe(409);
    expect(call('GET', '/api/sessions/availability?username=SARA').body).toEqual({
      username: 'SARA',
      available: false,
    });

    // once the session is old and has no open socket, the name is free again
    now += 2 * 60_000;
    expect(call('POST', '/api/sessions', { username: 'sara', color: '#2563eb' }).status).toBe(201);
    expect(call('GET', `/api/sessions/${first.token}`).status).toBe(404);
  });

  it('counts an open socket as online', () => {
    const { token } = join('tom');
    db.touchPresence('tab-1', { token, username: 'tom', color: '#2f9e44', room_id: 3 });
    now += 2 * 60_000;
    db.touchPresence('tab-1', { token, username: 'tom', color: '#2f9e44', room_id: 3 });

    expect(call('POST', '/api/sessions', { username: 'tom', color: '#2563eb' }).status).toBe(409);
    expect((call('GET', '/api/rooms/3').body as Room).online_count).toBe(3);

    now += PRESENCE_TTL_MS + 1;
    expect((call('GET', '/api/rooms/3').body as Room).online_count).toBe(2);
  });

  it('validates new sessions', () => {
    expect(call('POST', '/api/sessions', { username: 'a', color: '#2563eb' }).status).toBe(422);
    expect(
      call('POST', '/api/sessions', { username: 'hello world', color: '#2563eb' }).status,
    ).toBe(422);
    expect(call('POST', '/api/sessions', { username: 'valid', color: '#123456' }).status).toBe(422);
  });

  it('ends sessions', () => {
    const { token } = join('lena');
    expect(call('DELETE', `/api/sessions/${token}`).status).toBe(204);
    expect(call('DELETE', `/api/sessions/${token}`).status).toBe(404);
  });

  it('can be reset to the seed data', () => {
    const { token } = join();
    call('POST', '/api/rooms', { name: 'temp' }, token);
    db.reset();
    expect((call('GET', '/api/rooms').body as Room[]).map((room) => room.name)).not.toContain(
      'temp',
    );
  });
});
