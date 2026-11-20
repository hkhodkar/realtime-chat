from sqlmodel import Session, col, func, select

from .hub import ChatHub, ChatSession
from .models import Message, Room
from .schemas import MessageRead, RoomRead


def room_summary(db: Session, room: Room, hub: ChatHub) -> RoomRead:
    assert room.id is not None
    count = db.exec(select(func.count()).where(Message.room_id == room.id)).one()
    last = db.exec(
        select(Message).where(Message.room_id == room.id).order_by(col(Message.id).desc()).limit(1)
    ).first()
    return RoomRead(
        id=room.id,
        name=room.name,
        description=room.description,
        created_by=room.created_by,
        created_at=room.created_at,
        message_count=count,
        last_message=MessageRead.model_validate(last) if last else None,
        online_count=hub.online_count(room.id),
    )


def save_message(db: Session, room: Room, session: ChatSession, body: str) -> MessageRead:
    assert room.id is not None
    message = Message(room_id=room.id, author=session.username, color=session.color, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageRead.model_validate(message)


async def publish_message(db: Session, room: Room, message: MessageRead, hub: ChatHub) -> None:
    """Sends a new message to the room and the updated summary to everybody."""
    await hub.broadcast({"type": "message", "message": message.model_dump(mode="json")}, room.id)
    await publish_room(db, room, hub)


async def publish_room(db: Session, room: Room, hub: ChatHub) -> None:
    summary = room_summary(db, room, hub)
    await hub.broadcast({"type": "room_updated", "room": summary.model_dump(mode="json")})
