import os
from dataclasses import dataclass, field


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./chat.db"
    seed_demo_data: bool = True
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:4200"])
    # how long a username stays reserved after its last connection closed
    presence_grace_seconds: int = 60

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL", cls.database_url),
            seed_demo_data=_env_bool("SEED_DEMO_DATA", True),
            cors_origins=_env_list("CORS_ORIGINS", ["http://localhost:4200"]),
            presence_grace_seconds=int(os.getenv("PRESENCE_GRACE_SECONDS", "60")),
        )
