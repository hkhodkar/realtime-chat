import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, SQLModel

from .config import Settings
from .database import make_engine
from .hub import ChatHub
from .routers import messages, rooms, sessions, ws
from .seed import seed_if_empty

logger = logging.getLogger("chat")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        SQLModel.metadata.create_all(engine)
        if settings.seed_demo_data:
            with Session(engine) as session:
                if seed_if_empty(session):
                    logger.info("Database was empty, loaded demo rooms")
        yield
        engine.dispose()

    app = FastAPI(
        title="Realtime Chat API",
        description="Chat rooms with message history over REST and live events over WebSockets.",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.state.engine = engine
    app.state.hub = ChatHub(settings.presence_grace_seconds)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix="/api")
    for module in (rooms, messages, sessions, ws):
        api.include_router(module.router)

    @api.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api)
    return app


app = create_app()
