import { ChatUser, ServerEvent } from '../models/chat.models';
import { BOTS } from './mock-db';

/** What the bots need from the hub. */
export interface BotHost {
  readonly db: { rooms(): { id: number; name: string }[]; watchedRooms(): number[] };
  publish(event: ServerEvent, roomId: number | null): void;
  postMessage(roomId: number, author: ChatUser, body: string): void;
  localRooms(): number[];
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

const REPLIES: Record<string, readonly string[]> = {
  general: [
    'Nice! 🙌',
    'Totally agree',
    'Sounds good to me',
    'Haha, love it 😄',
    'Good point, {name}',
  ],
  frontend: [
    'Did you check it in Safari too? 😅',
    'Signals made that so much simpler',
    'Ship it behind a feature flag?',
    'Looks clean 👌',
  ],
  backend: [
    'Is there an index for that? 😄',
    "I'd add a test for that edge case",
    "Let's keep an eye on the logs after the deploy",
    'Makes sense, as long as the API stays backwards compatible',
  ],
  design: [
    'Love the spacing on that 😍',
    'Could we try it with a bit more contrast?',
    'That matches the design tokens 👌',
  ],
  random: [
    'Haha 😂',
    'Same here!',
    "That's the best thing I've read today",
    "Weekend can't come soon enough",
  ],
};

const IDLE: Record<string, readonly string[]> = {
  general: [
    'Coffee run in 10 minutes, anyone? ☕',
    'Reminder: demo day is on Friday 🎤',
    'Who changed the office playlist? 🎶',
    "Quick reminder to update your status if you're out tomorrow",
  ],
  frontend: [
    'Just upgraded to the latest Angular, smooth as butter 🧈',
    'Anyone else loving the new @for syntax?',
    'Lighthouse score is back to 98 on the landing page ⚡',
  ],
  backend: [
    'Staging deploy finished, all green ✅',
    'Database backup verified 👍',
    'Added rate limiting to the public API',
  ],
  design: [
    'New icon set is in Figma, feedback welcome 🎨',
    'Updated the color tokens, dark mode looks much better now',
    'Should buttons have 8px or 12px radius? Asking for a friend',
  ],
  random: [
    'Who wants to join the board game night on Friday? 🎲',
    'There is a very good dog at the office door right now 🐶',
    'Pizza or tacos for the team lunch? 🍕🌮',
  ],
};

const QUESTIONS = [
  "Good question 🤔 I'd try it on staging first",
  'Not sure, but Omar would know',
  'I think so! Let me double check and get back to you',
  "Hmm, I'd say yes, but let's bring it up in standup",
];

const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s)+$/u;

/** Picks a fitting answer to a message, with a little keyword matching. */
export function replyTo(
  text: string,
  author: string,
  room: string,
  bot: string,
  random = Math.random,
): string {
  const lower = text.toLowerCase();
  let line: string;
  if (lower.includes(bot.toLowerCase())) line = 'You called? 😄';
  else if (EMOJI_ONLY.test(text)) line = pick(['😂', '🙌', '💯', '🔥', '👍'], random);
  else if (/\b(hi|hey|hello|morning|hiya|yo)\b/.test(lower))
    line = pick(['Hey {name}! 👋', 'Hi {name}, welcome in 🙂', 'Morning {name}! ☕'], random);
  else if (/\b(thanks|thank you|thx|ty)\b/.test(lower))
    line = pick(['Anytime!', 'No problem 🙌', 'Happy to help'], random);
  else if (text.trim().endsWith('?')) line = pick(QUESTIONS, random);
  else line = pick(REPLIES[room] ?? REPLIES['general'], random);
  return line.replace('{name}', author);
}

/**
 * Two simulated teammates for the demo. They answer messages, greet people
 * who join and now and then start a conversation, always typing first. Only
 * one tab runs them, picked with the Web Locks API.
 */
export class BotCrew {
  private leader = false;
  private stopped = false;
  private release?: () => void;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly busyRooms = new Set<number>();
  private readonly greeted = new Set<string>();

  constructor(
    private readonly host: BotHost,
    private readonly random: () => number = Math.random,
  ) {}

  start(): void {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    if (locks?.request) {
      void locks
        .request('realtime-chat-demo-bots', () => {
          if (this.stopped) return undefined;
          this.becomeLeader();
          return new Promise<void>((resolve) => (this.release = resolve));
        })
        .catch(() => undefined);
    } else {
      this.becomeLeader();
    }
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.idleTimer);
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.release?.();
  }

  observe(event: ServerEvent, roomId: number | null): void {
    if (!this.leader || roomId === null) return;
    if (event.type === 'message' && !this.isBot(event.message.author)) {
      if (this.random() < 0.75) {
        this.later(600 + this.random() * 900, () =>
          this.say(roomId, (bot, room) =>
            replyTo(event.message.body, event.message.author, room, bot.username, this.random),
          ),
        );
      }
    }
    if (event.type === 'join' && !this.greeted.has(event.user.username)) {
      this.greeted.add(event.user.username);
      this.later(1200 + this.random() * 1500, () =>
        this.say(roomId, () =>
          pick(
            [
              `Welcome ${event.user.username}! 👋`,
              `Hey ${event.user.username}, good to see you 🙂`,
            ],
            this.random,
          ),
        ),
      );
    }
  }

  private becomeLeader(): void {
    this.leader = true;
    this.scheduleIdle();
  }

  private scheduleIdle(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(
      () => {
        this.chatter();
        this.scheduleIdle();
      },
      35_000 + this.random() * 40_000,
    );
  }

  /** Starts a topic in a watched room, or sometimes in another one so unread badges show up. */
  private chatter(): void {
    const rooms = this.host.db.rooms();
    if (!rooms.length || !this.host.localRooms().length) return;
    const watched = this.host.db.watchedRooms();
    const roomId =
      watched.length && this.random() < 0.6
        ? pick(watched, this.random)
        : pick(rooms, this.random).id;
    this.say(roomId, (_bot, room) => pick(IDLE[room] ?? IDLE['general'], this.random));
  }

  /** Shows a typing indicator for a moment, then posts. */
  private say(roomId: number, compose: (bot: ChatUser, room: string) => string): void {
    if (this.busyRooms.has(roomId)) {
      // someone is already typing there, answer a little later
      this.later(2500 + this.random() * 1500, () => this.say(roomId, compose));
      return;
    }
    const room = this.host.db.rooms().find((item) => item.id === roomId);
    if (!room) return;
    const bot = pick(BOTS, this.random);
    this.busyRooms.add(roomId);
    this.host.publish({ type: 'typing', username: bot.username, active: true }, roomId);
    this.later(1500 + this.random() * 2000, () => {
      this.busyRooms.delete(roomId);
      this.host.publish({ type: 'typing', username: bot.username, active: false }, roomId);
      this.host.postMessage(roomId, bot, compose(bot, room.name));
    });
  }

  private later(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.stopped) fn();
    }, ms);
    this.timers.add(timer);
  }

  private isBot(name: string): boolean {
    return BOTS.some((bot) => bot.username === name);
  }
}
