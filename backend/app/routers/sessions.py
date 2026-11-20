from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import TypeAdapter, ValidationError

from ..deps import Hub
from ..hub import UsernameTaken
from ..schemas import Availability, OnlineUser, SessionCreate, SessionRead, Username

router = APIRouter(tags=["sessions"])
_username = TypeAdapter(Username)


@router.post("/sessions", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, hub: Hub) -> SessionRead:
    """Joins the chat with a username. Names are unique among people who are online."""
    try:
        session = hub.create_session(payload.username, payload.color)
    except UsernameTaken:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"'{payload.username}' is already taken by someone online"
        ) from None
    return SessionRead(token=session.token, **session.public())


@router.get("/sessions/availability", response_model=Availability)
def username_availability(username: Annotated[str, Query(max_length=40)], hub: Hub) -> Availability:
    try:
        name = _username.validate_python(username)
    except ValidationError:
        return Availability(username=username, available=False)
    return Availability(username=name, available=hub.holder_of(name) is None)


@router.get("/sessions/{token}", response_model=SessionRead)
def get_session(token: str, hub: Hub) -> SessionRead:
    session = hub.get_session(token)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This session has expired")
    return SessionRead(token=session.token, **session.public())


@router.delete("/sessions/{token}", status_code=status.HTTP_204_NO_CONTENT)
def end_session(token: str, hub: Hub) -> Response:
    if not hub.end_session(token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This session has expired")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/online", response_model=list[OnlineUser])
def online_users(hub: Hub) -> list[dict[str, str]]:
    return hub.online_users()
