"""Demo rooms and message history so the app has something to show on first start."""

import json
from datetime import timedelta
from pathlib import Path

from sqlmodel import Session, func, select

from .database import utcnow
from .models import Message, Room

SEED_FILE = Path(__file__).with_name("seed_data.json")


def seed_if_empty(session: Session) -> bool:
    if session.exec(select(func.count()).select_from(Room)).one():
        return False

    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    colors = {user["username"]: user["color"] for user in data["users"]}
    now = utcnow()
    for entry in data["rooms"]:
        room = Room(
            name=entry["name"],
            description=entry["description"],
            created_by="Daniel",
            created_at=now - timedelta(days=7),
        )
        session.add(room)
        session.flush()
        for item in entry["messages"]:
            session.add(
                Message(
                    room_id=room.id,
                    author=item["author"],
                    color=colors[item["author"]],
                    body=item["body"],
                    created_at=now - timedelta(minutes=item["minutes_ago"]),
                )
            )
    session.commit()
    return True
