import { ServerEvent } from '../models/chat.models';
import { BotCrew, BotHost, replyTo } from './bots';

describe('replyTo', () => {
  const first = () => 0;

  it('answers greetings by name', () => {
    expect(replyTo('Hey team!', 'alex', 'general', 'Maya', first)).toBe('Hey alex! 👋');
  });

  it('answers questions and thanks', () => {
    expect(replyTo('Is staging down?', 'alex', 'backend', 'Leo', first)).toMatch(/question/);
    expect(replyTo('thanks a lot', 'alex', 'general', 'Leo', first)).toBe('Anytime!');
  });

  it('reacts to emoji with emoji', () => {
    expect(replyTo('🎉🎉', 'alex', 'random', 'Leo', first)).toBe('😂');
  });

  it('uses the room topic otherwise', () => {
    expect(replyTo('Pushed the fix', 'alex', 'frontend', 'Leo', first)).toMatch(/Safari/);
  });
});

describe('BotCrew', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const published: [ServerEvent, number | null][] = [];
    const posted: [number, string, string][] = [];
    const host: BotHost = {
      db: { rooms: () => [{ id: 1, name: 'general' }], watchedRooms: () => [1] },
      publish: (event, roomId) => published.push([event, roomId]),
      postMessage: (roomId, author, body) => posted.push([roomId, author.username, body]),
      localRooms: () => [1],
    };
    // always below the reply chance, always the first bot and line
    const crew = new BotCrew(host, () => 0);
    crew.start();
    return { crew, published, posted };
  }

  const message = (author: string, body: string): ServerEvent => ({
    type: 'message',
    message: { id: 1, room_id: 1, author, color: '#000', body, created_at: '' },
  });

  it('types for a moment and then replies to people', () => {
    const { crew, published, posted } = setup();

    crew.observe(message('alex', 'hello there'), 1);
    vi.advanceTimersByTime(700);
    expect(published.at(-1)).toEqual([{ type: 'typing', username: 'Maya', active: true }, 1]);
    expect(posted).toEqual([]);

    vi.advanceTimersByTime(1600);
    expect(posted).toEqual([[1, 'Maya', 'Hey alex! 👋']]);
    expect(published.at(-1)).toEqual([{ type: 'typing', username: 'Maya', active: false }, 1]);
    crew.stop();
  });

  it('does not answer other bots', () => {
    const { crew, posted } = setup();
    crew.observe(message('Leo', 'hello'), 1);
    vi.advanceTimersByTime(5000);
    expect(posted).toEqual([]);
    crew.stop();
  });

  it('starts a conversation now and then', () => {
    const { crew, posted } = setup();
    vi.advanceTimersByTime(40_000);
    expect(posted).toHaveLength(1);
    expect(posted[0][1]).toBe('Maya');
    crew.stop();
  });
});
