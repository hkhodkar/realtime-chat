from datetime import datetime

from sqlalchemy import Column, Index
from sqlmodel import Field, SQLModel

from .database import UTCDateTime, utcnow


class Room(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=30, unique=True, index=True)
    description: str | None = Field(default=None, max_length=140)
    created_by: str | None = Field(default=None, max_length=20)
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(UTCDateTime, nullable=False)
    )


class Message(SQLModel, table=True):
    __table_args__ = (Index("ix_message_room_id_id", "room_id", "id"),)

    id: int | None = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id", ondelete="CASCADE")
    author: str = Field(max_length=20)
    color: str = Field(max_length=7)
    body: str = Field(max_length=1000)
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(UTCDateTime, nullable=False)
    )
