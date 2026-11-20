import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_join_with_username_and_color(client):
    response = client.post("/api/sessions", json={"username": " sara ", "color": "#7c3aed"})

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "sara"
    assert body["color"] == "#7c3aed"
    assert len(body["token"]) > 20
    assert client.get(f"/api/sessions/{body['token']}").json()["username"] == "sara"


def test_username_is_unique_among_online_users(client, join):
    join("Sara")

    response = client.post("/api/sessions", json={"username": "sara", "color": "#2563eb"})

    assert response.status_code == 409
    assert "already taken" in response.json()["detail"]


def test_availability_check(client, join):
    join("tom")

    def available(name: str) -> bool:
        response = client.get("/api/sessions/availability", params={"username": name})
        return response.json()["available"]

    assert available("TOM") is False
    assert available("tomas") is True
    assert available("no spaces") is False


def test_leaving_frees_the_username(client, join):
    session = join("lena")

    assert client.delete(f"/api/sessions/{session['token']}").status_code == 204
    assert client.get(f"/api/sessions/{session['token']}").status_code == 404
    assert (
        client.post("/api/sessions", json={"username": "lena", "color": "#2563eb"}).status_code
        == 201
    )


def test_offline_sessions_do_not_block_names():
    app = create_app(Settings(database_url="sqlite://", presence_grace_seconds=0))
    with TestClient(app) as client:
        first = client.post("/api/sessions", json={"username": "omar", "color": "#0d9488"})
        second = client.post("/api/sessions", json={"username": "omar", "color": "#2563eb"})

        assert second.status_code == 201
        # the stale session was replaced
        assert client.get(f"/api/sessions/{first.json()['token']}").status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "a", "color": "#2563eb"},
        {"username": "x" * 21, "color": "#2563eb"},
        {"username": "hello world", "color": "#2563eb"},
        {"username": "_underscore", "color": "#2563eb"},
        {"username": "valid", "color": "#123456"},
        {"username": "valid"},
    ],
)
def test_session_validation(client, payload):
    assert client.post("/api/sessions", json=payload).status_code == 422


def test_online_users(client, join):
    join("priya", "#7c3aed")
    join("daniel", "#2563eb")

    users = client.get("/api/users/online").json()

    assert users == [
        {"username": "daniel", "color": "#2563eb"},
        {"username": "priya", "color": "#7c3aed"},
    ]


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}
