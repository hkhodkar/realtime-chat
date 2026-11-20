export interface ChatUser {
  username: string;
  color: string;
}

export interface Session extends ChatUser {
  token: string;
}

export interface Message {
  id: number;
  room_id: number;
  author: string;
  color: string;
  body: string;
  created_at: string;
}

export interface MessagePage {
  items: Message[];
  has_more: boolean;
}

export interface Room {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  message_count: number;
  last_message: Message | null;
  online_count: number;
}

export interface RoomCreate {
  name: string;
  description: string | null;
}

export interface Availability {
  username: string;
  available: boolean;
}

/** Events the server pushes over a room socket. */
export type ServerEvent =
  | { type: 'presence'; users: ChatUser[] }
  | { type: 'join' | 'leave'; user: ChatUser; at: string }
  | { type: 'message'; message: Message }
  | { type: 'typing'; username: string; active: boolean }
  | { type: 'room_updated'; room: Room }
  | { type: 'error'; detail: string };

/** Events the client sends over a room socket. */
export type ClientEvent = { type: 'message'; body: string } | { type: 'typing'; active: boolean };

export const AVATAR_COLORS = [
  '#d93f3f',
  '#e2681e',
  '#b7791f',
  '#2f9e44',
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#db2777',
] as const;

export const MESSAGE_MAX_LENGTH = 1000;
export const ROOM_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Length the way the API counts it: one per code point, so an emoji is one character. */
export function textLength(text: string): number {
  return [...text].length;
}
