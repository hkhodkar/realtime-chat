import { ChatUser, Message, Room } from '../models/chat.models';
import { SEED } from './seed-data';

export interface SeedData {
  users: ChatUser[];
  rooms: {
    name: string;
    description: string;
    messages: { author: string; body: string; minutes_ago: number }[];
  }[];
}

export interface RoomRow {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

interface ChatData {
  rooms: RoomRow[];
  messages: Message[];
}

interface SessionRow extends ChatUser {
  token: string;
  last_seen: number;
}

/** One open room socket in some tab, kept fresh by a heartbeat. */
export interface PresenceRow extends ChatUser {
  token: string;
  room_id: number;
  seen: number;
}

export interface MessageQuery {
  before: number | null;
  after: number | null;
  limit: number;
}

/** Two simulated teammates who are always online in the demo. */
export const BOTS: readonly ChatUser[] = [
  { username: 'Maya', color: '#b7791f' },
  { username: 'Leo', color: '#d93f3f' },
];

const KEYS = {
  data: 'realtime-chat.demo.data',
  sessions: 'realtime-chat.demo.sessions',
  presence: 'realtime-chat.demo.presence',
};
const SESSION_GRACE_MS = 60_000;
export const PRESENCE_TTL_MS = 30_000;

export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : 'Validation error');
  }
}

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The demo database. Everything lives in localStorage and is read again on
 * every call, so several tabs of the demo share one chat.
 */
export class MockDb {
  private readonly store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

  constructor(
    storage: Storage | null,
    private readonly seed: SeedData = SEED,
    private readonly clock: () => number = Date.now,
  ) {
    this.store = storage ?? new MemoryStorage();
  }

  reset(): void {
    this.write(KEYS.data, this.seeded());
  }

  // rooms

  rooms(): Room[] {
    const data = this.data();
    return data.rooms.map((room) => this.summary(room, data.messages));
  }

  room(id: number): Room {
    const data = this.data();
    const room = data.rooms.find((item) => item.id === id);
    if (!room) throw new MockError(404, `The room ${id} was not found`);
    return this.summary(room, data.messages);
  }

  hasRoom(id: number): boolean {
    return this.data().rooms.some((room) => room.id === id);
  }

  createRoom(name: string, description: string | null, createdBy: string): Room {
    const data = this.data();
    if (data.rooms.some((room) => room.name === name)) {
      throw new MockError(409, `A room named '${name}' already exists`);
    }
    const room: RoomRow = {
      id: Math.max(0, ...data.rooms.map((item) => item.id)) + 1,
      name,
      description,
      created_by: createdBy,
      created_at: this.iso(),
    };
    data.rooms.push(room);
    this.write(KEYS.data, data);
    return this.summary(room, data.messages);
  }

  // messages

  messages(roomId: number, query: MessageQuery): { items: Message[]; has_more: boolean } {
    this.room(roomId);
    let rows = this.data().messages.filter((message) => message.room_id === roomId);
    if (query.after !== null) {
      rows = rows.filter((message) => message.id > query.after!);
      return { items: rows.slice(0, query.limit), has_more: rows.length > query.limit };
    }
    if (query.before !== null) rows = rows.filter((message) => message.id < query.before!);
    const start = Math.max(0, rows.length - query.limit);
    return { items: rows.slice(start), has_more: start > 0 };
  }

  addMessage(roomId: number, author: ChatUser, body: string): Message {
    const data = this.data();
    if (!data.rooms.some((room) => room.id === roomId)) {
      throw new MockError(404, `The room ${roomId} was not found`);
    }
    const message: Message = {
      id: Math.max(0, ...data.messages.map((item) => item.id)) + 1,
      room_id: roomId,
      author: author.username,
      color: author.color,
      body,
      created_at: this.iso(),
    };
    data.messages.push(message);
    this.write(KEYS.data, data);
    return message;
  }

  // sessions

  createSession(user: ChatUser): SessionRow {
    if (!this.isAvailable(user.username)) {
      throw new MockError(409, `'${user.username}' is already taken by someone online`);
    }
    const sessions = this.sessions().filter((session) => !same(session.username, user.username));
    const session: SessionRow = { ...user, token: randomToken(), last_seen: this.clock() };
    this.write(KEYS.sessions, [...sessions, session]);
    return session;
  }

  session(token: string): SessionRow | null {
    const sessions = this.sessions();
    const session = sessions.find((item) => item.token === token);
    if (!session) return null;
    session.last_seen = this.clock();
    this.write(KEYS.sessions, sessions);
    return session;
  }

  endSession(token: string): boolean {
    const sessions = this.sessions();
    const rest = sessions.filter((session) => session.token !== token);
    this.write(KEYS.sessions, rest);
    return rest.length !== sessions.length;
  }

  isAvailable(username: string): boolean {
    if (BOTS.some((bot) => same(bot.username, username))) return false;
    const now = this.clock();
    const live = new Set(this.presence().map((row) => row.token));
    return !this.sessions().some(
      (session) =>
        same(session.username, username) &&
        (live.has(session.token) || now - session.last_seen < SESSION_GRACE_MS),
    );
  }

  onlineUsers(): ChatUser[] {
    const now = this.clock();
    const live = new Set(this.presence().map((row) => row.token));
    const humans = this.sessions().filter(
      (session) => live.has(session.token) || now - session.last_seen < SESSION_GRACE_MS,
    );
    return sortUsers([...BOTS, ...humans.map(({ username, color }) => ({ username, color }))]);
  }

  // presence

  touchPresence(connectionId: string, row: Omit<PresenceRow, 'seen'>): void {
    const rows = this.readPresence();
    rows[connectionId] = { ...row, seen: this.clock() };
    this.write(KEYS.presence, rows);
  }

  dropPresence(connectionId: string): void {
    const rows = this.readPresence();
    delete rows[connectionId];
    this.write(KEYS.presence, rows);
  }

  /** Who is in a room right now: the bots plus every fresh socket. */
  online(roomId: number): ChatUser[] {
    const humans = this.presence()
      .filter((row) => row.room_id === roomId)
      .map(({ username, color }) => ({ username, color }));
    return sortUsers([...BOTS, ...humans]);
  }

  /** Rooms with at least one human watching. */
  watchedRooms(): number[] {
    return [...new Set(this.presence().map((row) => row.room_id))];
  }

  // internals

  private summary(room: RoomRow, messages: Message[]): Room {
    const own = messages.filter((message) => message.room_id === room.id);
    return {
      ...room,
      message_count: own.length,
      last_message: own.at(-1) ?? null,
      online_count: this.online(room.id).length,
    };
  }

  private data(): ChatData {
    const data = this.read<ChatData | null>(KEYS.data, null);
    if (data?.rooms && data.messages) return data;
    const seeded = this.seeded();
    this.write(KEYS.data, seeded);
    return seeded;
  }

  private sessions(): SessionRow[] {
    return this.read<SessionRow[]>(KEYS.sessions, []);
  }

  private readPresence(): Record<string, PresenceRow> {
    const now = this.clock();
    const rows = this.read<Record<string, PresenceRow>>(KEYS.presence, {});
    for (const [id, row] of Object.entries(rows)) {
      if (now - row.seen > PRESENCE_TTL_MS) delete rows[id];
    }
    return rows;
  }

  private presence(): PresenceRow[] {
    return Object.values(this.readPresence());
  }

  private seeded(): ChatData {
    const now = this.clock();
    const colors = new Map(this.seed.users.map((user) => [user.username, user.color]));
    const rooms: RoomRow[] = [];
    const messages: Message[] = [];
    this.seed.rooms.forEach((entry, index) => {
      const id = index + 1;
      rooms.push({
        id,
        name: entry.name,
        description: entry.description,
        created_by: 'Daniel',
        created_at: new Date(now - 7 * 86_400_000).toISOString(),
      });
      for (const item of entry.messages) {
        messages.push({
          id: messages.length + 1,
          room_id: id,
          author: item.author,
          color: colors.get(item.author) ?? '#2563eb',
          body: item.body,
          created_at: new Date(now - item.minutes_ago * 60_000).toISOString(),
        });
      }
    });
    return { rooms, messages };
  }

  private iso(): string {
    return new Date(this.clock()).toISOString();
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.store.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.store.setItem(key, JSON.stringify(value));
    } catch {
      // storage full, the demo keeps going without persisting
    }
  }
}

function sortUsers(users: ChatUser[]): ChatUser[] {
  const unique = new Map(users.map((user) => [user.username.toLowerCase(), user]));
  return [...unique.values()].sort((a, b) =>
    a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }),
  );
}

export function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
