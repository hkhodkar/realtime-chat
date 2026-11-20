from tests.conftest import auth


def test_latest_page_is_returned_oldest_first(client):
    page = client.get("/api/rooms/1/messages", params={"limit": 10}).json()

    ids = [message["id"] for message in page["items"]]
    assert len(ids) == 10
    assert ids == sorted(ids)
    assert page["items"][-1]["body"] == "Done ✅"
    assert page["has_more"] is True


def test_paging_back_with_before(client):
    first = client.get("/api/rooms/1/messages", params={"limit": 30}).json()
    oldest = first["items"][0]["id"]

    older = client.get("/api/rooms/1/messages", params={"before": oldest, "limit": 30}).json()

    assert len(older["items"]) == 13
    assert older["has_more"] is False
    assert all(message["id"] < oldest for message in older["items"])
    assert older["items"][0]["body"].startswith("Morning all")


def test_after_returns_missed_messages(client, join):
    latest = client.get("/api/rooms/2/messages").json()["items"][-1]["id"]
    headers = auth(join())
    client.post("/api/rooms/2/messages", json={"body": "one"}, headers=headers)
    client.post("/api/rooms/2/messages", json={"body": "two"}, headers=headers)

    page = client.get("/api/rooms/2/messages", params={"after": latest}).json()

    assert [message["body"] for message in page["items"]] == ["one", "two"]
    assert page["has_more"] is False


def test_before_and_after_together_is_rejected(client):
    response = client.get("/api/rooms/1/messages", params={"before": 10, "after": 2})
    assert response.status_code == 422


def test_limit_is_bounded(client):
    assert client.get("/api/rooms/1/messages", params={"limit": 0}).status_code == 422
    assert client.get("/api/rooms/1/messages", params={"limit": 101}).status_code == 422


def test_messages_of_unknown_room(client):
    assert client.get("/api/rooms/42/messages").status_code == 404


def test_post_message_keeps_author_and_emoji(client, join):
    session = join("maria", "#db2777")
    response = client.post(
        "/api/rooms/4/messages", json={"body": "  Looks great 🎉\nShip it  "}, headers=auth(session)
    )

    assert response.status_code == 201
    message = response.json()
    assert message["author"] == "maria"
    assert message["color"] == "#db2777"
    assert message["body"] == "Looks great 🎉\nShip it"
    room = client.get("/api/rooms/4").json()
    assert room["message_count"] == 13
    assert room["last_message"]["id"] == message["id"]


def test_message_validation(client, join):
    headers = auth(join())
    assert (
        client.post("/api/rooms/1/messages", json={"body": "   "}, headers=headers).status_code
        == 422
    )
    too_long = {"body": "x" * 1001}
    assert client.post("/api/rooms/1/messages", json=too_long, headers=headers).status_code == 422
    # emoji count as one character each, like in the browser
    emoji = {"body": "🙂" * 1000}
    assert client.post("/api/rooms/1/messages", json=emoji, headers=headers).status_code == 201


def test_posting_needs_a_valid_session(client):
    response = client.post(
        "/api/rooms/1/messages", json={"body": "hi"}, headers={"X-Session-Token": "nope"}
    )
    assert response.status_code == 401
