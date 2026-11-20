import {
  AVATAR_COLORS,
  ChatUser,
  MESSAGE_MAX_LENGTH,
  ROOM_NAME_PATTERN,
  ServerEvent,
  USERNAME_PATTERN,
  textLength,
} from '../models/chat.models';
import { MockDb, MockError } from './mock-db';

/** Something the socket side has to broadcast after a REST call. */
export interface MockEffect {
  event: ServerEvent;
  roomId: number | null;
}

export interface MockResponse {
  status: number;
  body: unknown;
  effects?: MockEffect[];
}

interface Issue {
  type: string;
  loc: (string | number)[];
  msg: string;
  input: unknown;
}

/** Collects FastAPI style validation errors for one request. */
class Checker {
  readonly issues: Issue[] = [];

  constructor(
    private readonly source: Record<string, unknown>,
    private readonly where: 'body' | 'query',
  ) {}

  text(field: string, opts: { min?: number; max: number; required: boolean }): string | null {
    const value = this.source[field];
    if (value === undefined || value === null) {
      if (opts.required) this.fail(field, 'missing', 'Field required', value);
      return null;
    }
    if (typeof value !== 'string') {
      this.fail(field, 'string_type', 'Input should be a valid string', value);
      return null;
    }
    const trimmed = value.trim();
    const length = textLength(trimmed);
    if (opts.min && length < opts.min) {
      const unit = opts.min === 1 ? 'character' : 'characters';
      this.fail(
        field,
        'string_too_short',
        `String should have at least ${opts.min} ${unit}`,
        value,
      );
    } else if (length > opts.max) {
      this.fail(
        field,
        'string_too_long',
        `String should have at most ${opts.max} characters`,
        value,
      );
    }
    return trimmed;
  }

  int(field: string, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
    const raw = this.source[field];
    if (raw === undefined || raw === null || raw === '') return null;
    const value = Number(raw);
    if (!Number.isInteger(value)) {
      this.fail(field, 'int_parsing', 'Input should be a valid integer', raw);
      return null;
    }
    if (value < min)
      this.fail(
        field,
        'greater_than_equal',
        `Input should be greater than or equal to ${min}`,
        raw,
      );
    if (value > max)
      this.fail(field, 'less_than_equal', `Input should be less than or equal to ${max}`, raw);
    return value;
  }

  fail(field: string, type: string, msg: string, input: unknown): void {
    this.issues.push({ type, loc: [this.where, field], msg, input });
  }

  done(): void {
    if (this.issues.length) throw new MockError(422, this.issues);
  }
}

const ok = (body: unknown, status = 200, effects?: MockEffect[]): MockResponse => ({
  status,
  body,
  effects,
});

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function requireSession(db: MockDb, token: string | null): ChatUser {
  const session = token ? db.session(token) : null;
  if (!session) throw new MockError(401, 'Join the chat with a username first');
  return { username: session.username, color: session.color };
}

function roomEffect(db: MockDb, roomId: number): MockEffect {
  return { event: { type: 'room_updated', room: db.room(roomId) }, roomId: null };
}

/**
 * Answers an `/api` request the same way the FastAPI backend would: same
 * routes, validation, status codes and response shapes.
 */
export function handleMockRequest(
  db: MockDb,
  method: string,
  url: string,
  body: unknown,
  token: string | null = null,
): MockResponse {
  const parsed = new URL(url, 'http://demo.local');
  const path = parsed.pathname.replace(/\/+$/, '');
  const query = Object.fromEntries(parsed.searchParams);
  try {
    return route(db, method.toUpperCase(), path, query, asRecord(body), token);
  } catch (error) {
    if (error instanceof MockError) return { status: error.status, body: { detail: error.detail } };
    throw error;
  }
}

function route(
  db: MockDb,
  method: string,
  path: string,
  query: Record<string, string>,
  body: Record<string, unknown>,
  token: string | null,
): MockResponse {
  let match: RegExpMatchArray | null;

  if (path === '/api/health' && method === 'GET') return ok({ status: 'ok' });

  if (path === '/api/rooms') {
    if (method === 'GET') return ok(db.rooms());
    if (method === 'POST') {
      const check = new Checker(body, 'body');
      const name = check.text('name', { min: 2, max: 30, required: true })?.toLowerCase() ?? null;
      if (name && !check.issues.length && !ROOM_NAME_PATTERN.test(name)) {
        check.fail(
          'name',
          'value_error',
          "Value error, Use lowercase letters, numbers and single dashes, like 'design-review'",
          body['name'],
        );
      }
      const description = check.text('description', { max: 140, required: false });
      check.done();
      const author = requireSession(db, token);
      const room = db.createRoom(name!, description || null, author.username);
      return ok(room, 201, [roomEffect(db, room.id)]);
    }
    return notAllowed();
  }

  if ((match = path.match(/^\/api\/rooms\/(\d+)$/))) {
    if (method !== 'GET') return notAllowed();
    return ok(db.room(Number(match[1])));
  }

  if ((match = path.match(/^\/api\/rooms\/(\d+)\/messages$/))) {
    const roomId = Number(match[1]);
    if (method === 'GET') {
      const check = new Checker(query, 'query');
      const before = check.int('before', 1);
      const after = check.int('after', 0);
      const limit = check.int('limit', 1, 100) ?? 30;
      check.done();
      if (before !== null && after !== null) {
        throw new MockError(422, "Use either 'before' or 'after', not both");
      }
      return ok(db.messages(roomId, { before, after, limit }));
    }
    if (method === 'POST') {
      const check = new Checker(body, 'body');
      const text = check.text('body', { min: 1, max: MESSAGE_MAX_LENGTH, required: true });
      check.done();
      const author = requireSession(db, token);
      const message = db.addMessage(roomId, author, text!);
      return ok(message, 201, [
        { event: { type: 'message', message }, roomId },
        roomEffect(db, roomId),
      ]);
    }
    return notAllowed();
  }

  if (path === '/api/sessions' && method === 'POST') {
    const check = new Checker(body, 'body');
    const username = check.text('username', { min: 2, max: 20, required: true });
    if (username && !check.issues.length && !USERNAME_PATTERN.test(username)) {
      check.fail(
        'username',
        'value_error',
        'Value error, Use letters, numbers, dots, dashes or underscores',
        body['username'],
      );
    }
    const color = body['color'];
    if (!AVATAR_COLORS.includes(color as (typeof AVATAR_COLORS)[number])) {
      check.fail('color', 'literal_error', 'Input should be one of the avatar colors', color);
    }
    check.done();
    const session = db.createSession({ username: username!, color: color as string });
    return ok({ token: session.token, username: session.username, color: session.color }, 201);
  }

  if (path === '/api/sessions/availability' && method === 'GET') {
    const username = (query['username'] ?? '').trim();
    const valid =
      textLength(username) >= 2 && textLength(username) <= 20 && USERNAME_PATTERN.test(username);
    return ok({ username, available: valid && db.isAvailable(username) });
  }

  if ((match = path.match(/^\/api\/sessions\/([^/]+)$/))) {
    const sessionToken = decodeURIComponent(match[1]);
    if (method === 'GET') {
      const session = db.session(sessionToken);
      if (!session) throw new MockError(404, 'This session has expired');
      return ok({ token: session.token, username: session.username, color: session.color });
    }
    if (method === 'DELETE') {
      if (!db.endSession(sessionToken)) throw new MockError(404, 'This session has expired');
      return { status: 204, body: null };
    }
    return notAllowed();
  }

  if (path === '/api/users/online' && method === 'GET') return ok(db.onlineUsers());

  throw new MockError(404, 'Not Found');
}

function notAllowed(): never {
  throw new MockError(405, 'Method Not Allowed');
}
