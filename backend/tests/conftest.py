import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def _client(seed: bool):
    app = create_app(Settings(database_url="sqlite://", seed_demo_data=seed))
    with TestClient(app) as client:
        yield client


@pytest.fixture
def client():
    yield from _client(seed=True)


@pytest.fixture
def empty_client():
    yield from _client(seed=False)


@pytest.fixture
def join(client):
    """Creates a chat session and returns it (token, username, color)."""

    def _join(username: str = "alex", color: str = "#2563eb") -> dict:
        response = client.post("/api/sessions", json={"username": username, "color": color})
        assert response.status_code == 201, response.text
        return response.json()

    return _join


def auth(session: dict) -> dict[str, str]:
    return {"X-Session-Token": session["token"]}
