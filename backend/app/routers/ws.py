from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlmodel import Session

from ..database import utcnow
from ..hub import ChatHub, Connection
from ..models import Room
from ..schemas import MessageCreate
from ..services import publish_message, publish_room, save_message

router = APIRouter(tags=["websocket"])

# custom close codes, the client reacts to them instead of retrying blindly
SESSION_EXPIRED = 4401
ROOM_NOT_FOUND = 4404


@router.websocket("/rooms/{room_id}/ws")
async def room_socket(websocket: WebSocket, room_id: int, token: str = "") -> None:
    """Live events for one room.

    Client -> server: `{"type": "message", "body": "..."}`, `{"type": "typing", "active": true}`.
    Server -> client: `presence`, `join`, `leave`, `message`, `typing`, `room_updated`, `error`.
    """
    hub: ChatHub = websocket.app.state.hub
    await websocket.accept()

    session = hub.get_session(token)
    if session is None:
        await websocket.close(code=SESSION_EXPIRED, reason="Session expired")
        return
    with Session(websocket.app.state.engine) as db:
        room = db.get(Room, room_id)
    if room is None:
        await websocket.close(code=ROOM_NOT_FOUND, reason="Room not found")
        return

    connection = Connection(websocket, session, room_id)
    entered = hub.add(connection)
    await websocket.send_json({"type": "presence", "users": hub.online_users(room_id)})
    if entered:
        await _announce(hub, room, "join", connection)

    try:
        while True:
            data = await websocket.receive_json()
            await _handle(hub, room, connection, data)
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        if hub.remove(connection):
            await _announce(hub, room, "leave", connection)


async def _handle(hub: ChatHub, room: Room, connection: Connection, data: object) -> None:
    kind = data.get("type") if isinstance(data, dict) else None
    if kind == "typing" and isinstance(data, dict):
        event = {
            "type": "typing",
            "username": connection.session.username,
            "active": bool(data.get("active")),
        }
        await hub.broadcast(event, room.id, exclude=connection)
    elif kind == "message" and isinstance(data, dict):
        try:
            payload = MessageCreate.model_validate({"body": data.get("body")})
        except ValidationError as error:
            message = error.errors()[0]["msg"]
            await connection.websocket.send_json({"type": "error", "detail": message})
            return
        with Session(connection.websocket.app.state.engine) as db:
            saved = save_message(db, room, connection.session, payload.body)
            await publish_message(db, room, saved, hub)
    else:
        await connection.websocket.send_json({"type": "error", "detail": "Unknown event type"})


async def _announce(hub: ChatHub, room: Room, kind: str, connection: Connection) -> None:
    event = {"type": kind, "user": connection.session.public(), "at": utcnow().isoformat()}
    await hub.broadcast(event, room.id, exclude=connection if kind == "join" else None)
    with Session(connection.websocket.app.state.engine) as db:
        await publish_room(db, room, hub)
