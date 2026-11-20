import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Availability,
  ChatUser,
  Message,
  MessagePage,
  Room,
  RoomCreate,
  Session,
} from '../models/chat.models';

export interface MessageQuery {
  before?: number;
  after?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly http = inject(HttpClient);

  rooms(): Observable<Room[]> {
    return this.http.get<Room[]>('/api/rooms');
  }

  room(id: number): Observable<Room> {
    return this.http.get<Room>(`/api/rooms/${id}`);
  }

  createRoom(payload: RoomCreate): Observable<Room> {
    return this.http.post<Room>('/api/rooms', payload);
  }

  messages(roomId: number, query: MessageQuery = {}): Observable<MessagePage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params = params.set(key, value);
    }
    return this.http.get<MessagePage>(`/api/rooms/${roomId}/messages`, { params });
  }

  postMessage(roomId: number, body: string): Observable<Message> {
    return this.http.post<Message>(`/api/rooms/${roomId}/messages`, { body });
  }

  createSession(user: ChatUser): Observable<Session> {
    return this.http.post<Session>('/api/sessions', user);
  }

  session(token: string): Observable<Session> {
    return this.http.get<Session>(`/api/sessions/${encodeURIComponent(token)}`);
  }

  endSession(token: string): Observable<void> {
    return this.http.delete<void>(`/api/sessions/${encodeURIComponent(token)}`);
  }

  availability(username: string): Observable<Availability> {
    return this.http.get<Availability>('/api/sessions/availability', { params: { username } });
  }

  onlineUsers(): Observable<ChatUser[]> {
    return this.http.get<ChatUser[]>('/api/users/online');
  }
}
