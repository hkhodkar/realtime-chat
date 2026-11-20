import { Message } from '../models/chat.models';

/** A join/leave line, only kept in memory for the current visit. */
export interface SystemNote {
  id: string;
  text: string;
  at: string;
}

export type TimelineBlock =
  | { type: 'day'; key: string; label: string }
  | {
      type: 'group';
      key: string;
      author: string;
      color: string;
      at: string;
      messages: Message[];
    }
  | { type: 'system'; key: string; text: string; at: string };

/** Messages from the same author within this window share one header. */
const GROUP_WINDOW_MS = 5 * 60_000;

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayLabel(date: Date, now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Builds what the message list renders: day dividers, runs of messages by the
 * same author, and join/leave notes, all in time order.
 */
export function buildTimeline(
  messages: readonly Message[],
  notes: readonly SystemNote[] = [],
  now = new Date(),
): TimelineBlock[] {
  type Entry = { at: number; message?: Message; note?: SystemNote };
  const entries: Entry[] = [
    ...messages.map((message) => ({ at: Date.parse(message.created_at), message })),
    ...notes.map((note) => ({ at: Date.parse(note.at), note })),
  ].sort((a, b) => a.at - b.at);

  const blocks: TimelineBlock[] = [];
  let currentDay = '';
  let group: Extract<TimelineBlock, { type: 'group' }> | null = null;
  let groupEnd = 0;

  for (const entry of entries) {
    const date = new Date(entry.at);
    const day = dayKey(date);
    if (day !== currentDay) {
      currentDay = day;
      group = null;
      blocks.push({ type: 'day', key: `day-${day}`, label: dayLabel(date, now) });
    }
    if (entry.note) {
      group = null;
      blocks.push({ type: 'system', key: entry.note.id, text: entry.note.text, at: entry.note.at });
      continue;
    }
    const message = entry.message!;
    if (group && group.author === message.author && entry.at - groupEnd <= GROUP_WINDOW_MS) {
      group.messages.push(message);
    } else {
      group = {
        type: 'group',
        key: `group-${message.id}`,
        author: message.author,
        color: message.color,
        at: message.created_at,
        messages: [message],
      };
      blocks.push(group);
    }
    groupEnd = entry.at;
  }
  return blocks;
}

export function typingLabel(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing…`;
  return 'Several people are typing…';
}

/** Adds messages into an id-sorted list without duplicates. */
export function mergeMessages(
  current: readonly Message[],
  incoming: readonly Message[],
): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
