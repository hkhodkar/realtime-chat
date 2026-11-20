import re
from datetime import datetime
from typing import Annotated, Literal, get_args

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

MESSAGE_MAX_LENGTH = 1000

_ROOM_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_USERNAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


def _room_name(value: str) -> str:
    if not _ROOM_NAME.match(value):
        raise ValueError("Use lowercase letters, numbers and single dashes, like 'design-review'")
    return value


def _username(value: str) -> str:
    if not _USERNAME.match(value):
        raise ValueError("Use letters, numbers, dots, dashes or underscores")
    return value


def _empty_to_none(value: str | None) -> str | None:
    return value or None


RoomName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=2, max_length=30),
    AfterValidator(_room_name),
]
Username = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=20),
    AfterValidator(_username),
]
AvatarColor = Literal[
    "#d93f3f", "#e2681e", "#b7791f", "#2f9e44", "#0d9488", "#2563eb", "#7c3aed", "#db2777"
]
AVATAR_COLORS: tuple[str, ...] = get_args(AvatarColor)
MessageBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MESSAGE_MAX_LENGTH)
]


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: int
    author: str
    color: str
    body: str
    created_at: datetime


class MessageCreate(BaseModel):
    body: MessageBody


class MessagePage(BaseModel):
    items: list[MessageRead]
    has_more: bool = Field(description="True when there are more messages in the paging direction")


class RoomCreate(BaseModel):
    name: RoomName
    description: Annotated[
        str | None,
        StringConstraints(strip_whitespace=True, max_length=140),
        AfterValidator(_empty_to_none),
    ] = None


class RoomRead(BaseModel):
    id: int
    name: str
    description: str | None
    created_by: str | None
    created_at: datetime
    message_count: int
    last_message: MessageRead | None
    online_count: int


class SessionCreate(BaseModel):
    username: Username
    color: AvatarColor


class OnlineUser(BaseModel):
    username: str
    color: str


class SessionRead(OnlineUser):
    token: str


class Availability(BaseModel):
    username: str
    available: bool
