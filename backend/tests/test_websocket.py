import pytest
from starlette.websockets import WebSocketDisconnect


def ws_url(room_id: int, session: dict) -> str:
    return f"/api/rooms/{room_id}/ws?token={session['token']}"


def receive_until(ws, kind: str) -> dict:
    """Skips other events (room summaries etc.) until the wanted one arrives."""
    for _ in range(20):
        event = ws.receive_json()
        if event["type"] == kind:
            return event
    raise AssertionError(f"no {kind} event")


def room_update(ws, room_id: int) -> dict:
    for _ in range(20):
        event = receive_until(ws, "room_updated")
        if event["room"]["id"] == room_id:
            return event["room"]
    raise AssertionError(f"no update for room {room_id}")


def test_unknown_session_is_rejected(client):
    with client.websocket_connect("/api/rooms/1/ws?token=bogus") as ws:
        with pytest.raises(WebSocketDisconnect) as info:
            ws.receive_json()
    assert info.value.code == 4401


def test_unknown_room_is_rejected(client, join):
    with client.websocket_connect(ws_url(99, join())) as ws:
        with pytest.raises(WebSocketDisconnect) as info:
            ws.receive_json()
    assert info.value.code == 4404


def test_presence_join_and_leave(client, join):
    sara, tom = join("sara", "#db2777"), join("tom", "#2f9e44")

    with client.websocket_connect(ws_url(1, sara)) as first:
        snapshot = first.receive_json()
        assert snapshot == {"type": "presence", "users": [{"username": "sara", "color": "#db2777"}]}

        with client.websocket_connect(ws_url(1, tom)) as second:
            users = second.receive_json()["users"]
            assert [user["username"] for user in users] == ["sara", "tom"]

            joined = receive_until(first, "join")
            assert joined["user"] == {"username": "tom", "color": "#2f9e44"}
            assert client.get("/api/rooms/1").json()["online_count"] == 2

        left = receive_until(first, "leave")
        assert left["user"]["username"] == "tom"
        assert client.get("/api/rooms/1").json()["online_count"] == 1


def test_messages_are_broadcast_and_persisted(client, join):
    sara, tom = join("sara"), join("tom")

    with client.websocket_connect(ws_url(2, sara)) as first:
        with client.websocket_connect(ws_url(2, tom)) as second:
            second.send_json({"type": "message", "body": "Deploy is green 🚀"})

            for ws in (first, second):
                message = receive_until(ws, "message")["message"]
                assert message["author"] == "tom"
                assert message["body"] == "Deploy is green 🚀"

            summary = receive_until(first, "room_updated")["room"]
            assert summary["id"] == 2
            assert summary["last_message"]["body"] == "Deploy is green 🚀"

    history = client.get("/api/rooms/2/messages").json()["items"]
    assert history[-1]["body"] == "Deploy is green 🚀"


def test_room_updates_reach_other_rooms(client, join):
    sara, tom = join("sara"), join("tom")

    with client.websocket_connect(ws_url(1, sara)) as general:
        general.receive_json()
        with client.websocket_connect(ws_url(5, tom)) as random:
            # tom entering #random already updates its online count for everybody
            entered = room_update(general, 5)
            assert entered["online_count"] == 1

            random.send_json({"type": "message", "body": "Anyone for coffee?"})
            assert room_update(general, 5)["last_message"]["body"] == "Anyone for coffee?"


def test_typing_goes_to_everyone_else(client, join):
    sara, tom = join("sara"), join("tom")

    with client.websocket_connect(ws_url(3, sara)) as first:
        first.receive_json()
        with client.websocket_connect(ws_url(3, tom)) as second:
            second.receive_json()
            receive_until(first, "join")
            second.send_json({"type": "typing", "active": True})

            assert receive_until(first, "typing") == {
                "type": "typing",
                "username": "tom",
                "active": True,
            }
            # the sender gets nothing back, so the next event it sees is its own message
            second.send_json({"type": "message", "body": "done"})
            assert receive_until(second, "message")["message"]["body"] == "done"
            assert all(second.receive_json()["type"] != "typing" for _ in range(1))


def test_invalid_events_get_an_error(client, join):
    with client.websocket_connect(ws_url(1, join())) as ws:
        ws.receive_json()
        ws.send_json({"type": "message", "body": ""})
        assert receive_until(ws, "error")["detail"]

        ws.send_json({"type": "message", "body": "x" * 1001})
        assert "1000" in receive_until(ws, "error")["detail"]

        ws.send_json({"type": "dance"})
        assert receive_until(ws, "error")["detail"] == "Unknown event type"


def test_second_tab_of_same_user_does_not_rejoin(client, join):
    sara, tom = join("sara"), join("tom")

    with client.websocket_connect(ws_url(4, tom)) as watcher:
        watcher.receive_json()
        with client.websocket_connect(ws_url(4, sara)):
            assert receive_until(watcher, "join")["user"]["username"] == "sara"
            with client.websocket_connect(ws_url(4, sara)) as second_tab:
                users = second_tab.receive_json()["users"]
                assert [user["username"] for user in users] == ["sara", "tom"]
            # closing one of two tabs is not a leave
            watcher.send_json({"type": "message", "body": "ping"})
            event = watcher.receive_json()
            while event["type"] != "message":
                assert event["type"] != "leave"
                event = watcher.receive_json()
        assert receive_until(watcher, "leave")["user"]["username"] == "sara"
