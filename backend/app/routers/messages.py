from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import col, select

from ..deps import CurrentSession, DbSession, Hub, get_room_or_404
from ..models import Message
from ..schemas import MessageCreate, MessagePage, MessageRead
from ..services import publish_message, save_message

router = APIRouter(prefix="/rooms/{room_id}/messages", tags=["messages"])


@router.get("", response_model=MessagePage)
def list_messages(
    room_id: int,
    db: DbSession,
    before: Annotated[int | None, Query(ge=1, description="Older than this message id")] = None,
    after: Annotated[int | None, Query(ge=0, description="Newer than this message id")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> MessagePage:
    """Cursor based history, always returned oldest first.

    Without a cursor you get the latest messages. `before` pages back in time
    (scrolling up), `after` fetches what was missed (after a reconnect).
    """
    if before is not None and after is not None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Use either 'before' or 'after', not both"
        )
    get_room_or_404(db, room_id)
    stmt = select(Message).where(Message.room_id == room_id)
    if after is not None:
        stmt = stmt.where(col(Message.id) > after).order_by(col(Message.id).asc())
    else:
        if before is not None:
            stmt = stmt.where(col(Message.id) < before)
        stmt = stmt.order_by(col(Message.id).desc())

    rows = list(db.exec(stmt.limit(limit + 1)).all())
    has_more = len(rows) > limit
    rows = rows[:limit]
    if after is None:
        rows.reverse()
    return MessagePage(items=[MessageRead.model_validate(m) for m in rows], has_more=has_more)


@router.post("", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def post_message(
    room_id: int, payload: MessageCreate, db: DbSession, hub: Hub, session: CurrentSession
) -> MessageRead:
    """Posts without a websocket, handy for scripts. Live clients send over the socket."""
    room = get_room_or_404(db, room_id)
    message = save_message(db, room, session, payload.body)
    await publish_message(db, room, message, hub)
    return message
