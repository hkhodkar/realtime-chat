"""In-memory sessions, presence and fan-out for the room websockets."""

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from fastapi import WebSocket

from .database import utcnow


@dataclass
class ChatSession:
    token: str
    username: str
    color: str
    last_seen: datetime = field(default_factory=utcnow)

    def public(self) -> dict[str, str]:
        return {"username": self.username, "color": self.color}


@dataclass(eq=False)
class Connection:
    websocket: WebSocket
    session: ChatSession
    room_id: int


class UsernameTaken(Exception):
    pass


class ChatHub:
    def __init__(self, grace_seconds: int = 60) -> None:
        self.grace = timedelta(seconds=grace_seconds)
        self.sessions: dict[str, ChatSession] = {}
        self.connections: set[Connection] = set()

    # sessions

    def is_online(self, session: ChatSession) -> bool:
        if any(c.session is session for c in self.connections):
            return True
        return utcnow() - session.last_seen < self.grace

    def holder_of(self, username: str) -> ChatSession | None:
        key = username.casefold()
        for session in self.sessions.values():
            if session.username.casefold() == key and self.is_online(session):
                return session
        return None

    def create_session(self, username: str, color: str) -> ChatSession:
        if self.holder_of(username) is not None:
            raise UsernameTaken(username)
        # an offline session with the same name is simply replaced
        key = username.casefold()
        self.sessions = {
            token: s for token, s in self.sessions.items() if s.username.casefold() != key
        }
        session = ChatSession(secrets.token_urlsafe(24), username, color)
        self.sessions[session.token] = session
        return session

    def get_session(self, token: str) -> ChatSession | None:
        session = self.sessions.get(token)
        if session is not None:
            session.last_seen = utcnow()
        return session

    def end_session(self, token: str) -> bool:
        return self.sessions.pop(token, None) is not None

    def online_users(self, room_id: int | None = None) -> list[dict[str, str]]:
        if room_id is None:
            people = [s for s in self.sessions.values() if self.is_online(s)]
        else:
            people = [c.session for c in self.connections if c.room_id == room_id]
        unique = {s.username.casefold(): s.public() for s in people}
        return sorted(unique.values(), key=lambda user: user["username"].casefold())

    def online_count(self, room_id: int) -> int:
        return len(
            {c.session.username.casefold() for c in self.connections if c.room_id == room_id}
        )

    # connections

    def _in_room(self, session: ChatSession, room_id: int, skip: Connection | None = None) -> bool:
        return any(
            c is not skip and c.room_id == room_id and c.session is session
            for c in self.connections
        )

    def add(self, connection: Connection) -> bool:
        """Registers a socket, returns True when the user just entered the room."""
        first = not self._in_room(connection.session, connection.room_id)
        self.connections.add(connection)
        return first

    def remove(self, connection: Connection) -> bool:
        """Drops a socket, returns True when it was the user's last one in the room."""
        self.connections.discard(connection)
        connection.session.last_seen = utcnow()
        return not self._in_room(connection.session, connection.room_id)

    async def broadcast(
        self, event: dict[str, Any], room_id: int | None = None, exclude: Connection | None = None
    ) -> None:
        targets = [
            c
            for c in list(self.connections)
            if c is not exclude and (room_id is None or c.room_id == room_id)
        ]
        for connection in targets:
            try:
                await connection.websocket.send_json(event)
            except Exception:  # a dead socket is cleaned up by its own handler
                pass
