import { Message } from '../models/chat.models';
import { buildTimeline, dayLabel, mergeMessages, typingLabel } from './timeline';

const at = (iso: string) => new Date(iso).toISOString();
let nextId = 1;
const msg = (author: string, time: string, body = 'hi'): Message => ({
  id: nextId++,
  room_id: 1,
  author,
  color: '#000',
  body,
  created_at: at(time),
});

describe('buildTimeline', () => {
  const now = new Date('2026-11-20T15:00:00');

  it('groups messages by author and day', () => {
    const messages = [
      msg('Sara', '2026-11-19T09:00:00'),
      msg('Sara', '2026-11-19T09:02:00'),
      msg('Tom', '2026-11-19T09:03:00'),
      msg('Tom', '2026-11-20T08:00:00'),
      msg('Tom', '2026-11-20T08:20:00'),
    ];

    const blocks = buildTimeline(messages, [], now);

    expect(
      blocks.map((b) =>
        b.type === 'group'
          ? `${b.author}:${b.messages.length}`
          : b.type === 'day'
            ? b.label
            : b.text,
      ),
    ).toEqual([
      'Yesterday',
      'Sara:2',
      'Tom:1',
      'Today',
      // 20 minutes apart is a new group
      'Tom:1',
      'Tom:1',
    ]);
  });

  it('puts join and leave notes in time order and breaks groups', () => {
    const messages = [msg('Sara', '2026-11-20T10:00:00'), msg('Sara', '2026-11-20T10:02:00')];
    const notes = [{ id: 'n1', text: 'Tom joined the room', at: at('2026-11-20T10:01:00') }];

    const blocks = buildTimeline(messages, notes, now);

    expect(blocks.map((b) => b.type)).toEqual(['day', 'group', 'system', 'group']);
  });

  it('labels older days with the date', () => {
    expect(dayLabel(new Date('2026-11-16T10:00:00'), now)).toBe('Monday, November 16');
    expect(dayLabel(new Date('2025-12-31T10:00:00'), now)).toBe('Wednesday, December 31, 2025');
  });
});

describe('typingLabel', () => {
  it('reads naturally for any number of people', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['Sara'])).toBe('Sara is typing…');
    expect(typingLabel(['Sara', 'Leo'])).toBe('Sara and Leo are typing…');
    expect(typingLabel(['Sara', 'Leo', 'Tom'])).toBe('Sara, Leo and Tom are typing…');
    expect(typingLabel(['a', 'b', 'c', 'd'])).toBe('Several people are typing…');
  });
});

describe('mergeMessages', () => {
  it('keeps id order and drops duplicates', () => {
    const a = msg('Sara', '2026-11-20T10:00:00');
    const b = msg('Tom', '2026-11-20T10:01:00');
    const c = msg('Tom', '2026-11-20T10:02:00');
    expect(mergeMessages([b, c], [a, c]).map((m) => m.id)).toEqual([a.id, b.id, c.id]);
  });
});
