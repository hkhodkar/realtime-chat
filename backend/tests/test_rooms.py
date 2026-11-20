from tests.conftest import auth


def test_lists_seeded_rooms_with_summaries(client):
    rooms = client.get("/api/rooms").json()

    assert [room["name"] for room in rooms] == [
        "general",
        "frontend",
        "backend",
        "design",
        "random",
    ]
    general = rooms[0]
    assert general["message_count"] == 43
    assert general["last_message"]["body"] == "Done ✅"
    assert general["last_message"]["author"] == "Tom"
    assert general["online_count"] == 0


def test_empty_database_has_no_rooms(empty_client):
    assert empty_client.get("/api/rooms").json() == []


def test_create_room(client, join):
    session = join("sara")
    response = client.post(
        "/api/rooms",
        json={"name": "  Release-Notes ", "description": "  What shipped this week  "},
        headers=auth(session),
    )

    assert response.status_code == 201
    room = response.json()
    assert room["name"] == "release-notes"
    assert room["description"] == "What shipped this week"
    assert room["created_by"] == "sara"
    assert room["message_count"] == 0
    assert room["last_message"] is None
    assert client.get(f"/api/rooms/{room['id']}").json()["name"] == "release-notes"


def test_blank_description_is_stored_as_null(client, join):
    response = client.post(
        "/api/rooms", json={"name": "qa", "description": "   "}, headers=auth(join())
    )
    assert response.json()["description"] is None


def test_create_room_needs_a_session(client):
    response = client.post("/api/rooms", json={"name": "secret"})
    assert response.status_code == 401


def test_room_names_are_unique(client, join):
    response = client.post("/api/rooms", json={"name": "General"}, headers=auth(join()))
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_room_validation(client, join):
    headers = auth(join())
    for payload in (
        {"name": "x"},
        {"name": "has spaces"},
        {"name": "double--dash"},
        {"name": "-leading"},
        {"name": "a" * 31},
        {"name": "ok-name", "description": "d" * 141},
    ):
        response = client.post("/api/rooms", json=payload, headers=headers)
        assert response.status_code == 422, payload


def test_unknown_room_is_404(client):
    response = client.get("/api/rooms/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "The room 999 was not found"
