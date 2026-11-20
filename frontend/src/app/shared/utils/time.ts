import { dayKey } from '../../core/chat/timeline';

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Compact time for the room list: clock time today, otherwise the day. */
export function shortTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (dayKey(date) === dayKey(now)) return clockTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  if (now.getTime() - date.getTime() < 6 * 86_400_000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
