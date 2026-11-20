from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlmodel import Session

from .database import get_db
from .hub import ChatHub, ChatSession
from .models import Room

DbSession = Annotated[Session, Depends(get_db)]


def get_hub(request: Request) -> ChatHub:
    return request.app.state.hub


Hub = Annotated[ChatHub, Depends(get_hub)]


def current_session(
    hub: Hub, x_session_token: Annotated[str | None, Header()] = None
) -> ChatSession:
    session = hub.get_session(x_session_token) if x_session_token else None
    if session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Join the chat with a username first")
    return session


CurrentSession = Annotated[ChatSession, Depends(current_session)]


def get_room_or_404(db: Session, room_id: int) -> Room:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"The room {room_id} was not found")
    return room
