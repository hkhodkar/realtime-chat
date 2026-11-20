import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ChatApi } from '../api/chat-api';
import { Room } from '../models/chat.models';
import { BROWSER_STORAGE } from '../session/browser-storage';
import { SessionStore } from '../session/session.store';
import { RoomsStore } from './rooms.store';

const room = (id: number, name: string, count: number, lastAuthor = 'Tom'): Room => ({
  id,
  name,
  description: null,
  created_by: null,
  created_at: '2026-11-20T10:00:00Z',
  message_count: count,
  last_message: count
    ? {
        id: count,
        room_id: id,
        author: lastAuthor,
        color: '#000',
        body: 'hi',
        created_at: '2026-11-20T10:00:00Z',
      }
    : null,
  online_count: 0,
});

describe('RoomsStore', () => {
  let store: RoomsStore;
  let rooms: Room[];

  beforeEach(async () => {
    rooms = [room(1, 'general', 10), room(2, 'random', 4)];
    TestBed.configureTestingModule({
      providers: [
        { provide: BROWSER_STORAGE, useValue: null },
        { provide: ChatApi, useValue: { rooms: () => of(rooms) } },
      ],
    });
    TestBed.inject(SessionStore).save({ token: 't', username: 'alex', color: '#2563eb' });
    store = TestBed.inject(RoomsStore);
    await store.load();
    store.activeRoomId.set(1);
  });

  it('starts with everything read', () => {
    expect(store.unread()).toEqual({ 1: 0, 2: 0 });
  });

  it('counts new messages in other rooms as unread', () => {
    store.upsert(room(2, 'random', 7));
    store.upsert(room(1, 'general', 12));

    expect(store.unread()).toEqual({ 1: 0, 2: 3 });
    expect(store.totalUnread()).toBe(3);

    store.markRead(2);
    expect(store.unread()[2]).toBe(0);
  });

  it('never counts your own messages', () => {
    store.upsert(room(2, 'random', 5, 'alex'));
    expect(store.unread()[2]).toBe(0);
  });

  it('adds rooms created by others, unread from their first message', () => {
    store.upsert(room(3, 'release-notes', 0));
    store.upsert(room(3, 'release-notes', 2));

    expect(store.rooms().map((r) => r.name)).toEqual(['general', 'random', 'release-notes']);
    expect(store.unread()[3]).toBe(2);
    expect(store.byName('release-notes')?.id).toBe(3);
  });
});
