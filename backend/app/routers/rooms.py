from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, func, select

from ..deps import CurrentSession, DbSession, Hub, get_room_or_404
from ..models import Room
from ..schemas import RoomCreate, RoomRead
from ..services import publish_room, room_summary

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomRead])
def list_rooms(db: DbSession, hub: Hub) -> list[RoomRead]:
    rooms = db.exec(select(Room).order_by(col(Room.id))).all()
    return [room_summary(db, room, hub) for room in rooms]


@router.post("", response_model=RoomRead, status_code=status.HTTP_201_CREATED)
async def create_room(payload: RoomCreate, db: DbSession, hub: Hub, session: CurrentSession):
    taken = db.exec(select(func.count()).where(Room.name == payload.name)).one()
    if taken:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A room named '{payload.name}' already exists"
        )
    room = Room(name=payload.name, description=payload.description, created_by=session.username)
    db.add(room)
    db.commit()
    db.refresh(room)
    await publish_room(db, room, hub)
    return room_summary(db, room, hub)


@router.get("/{room_id}", response_model=RoomRead)
def get_room(room_id: int, db: DbSession, hub: Hub) -> RoomRead:
    return room_summary(db, get_room_or_404(db, room_id), hub)
