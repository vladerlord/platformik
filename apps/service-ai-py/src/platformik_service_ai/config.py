import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AppSettings:
    temporal_address: str
    temporal_namespace: str
    temporal_task_queue: str


def require_env(name: str) -> str:
    value = os.getenv(name)
    if value is None:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_settings() -> AppSettings:
    return AppSettings(
        temporal_address=require_env("TEMPORAL_ADDRESS"),
        temporal_namespace=require_env("TEMPORAL_NAMESPACE"),
        temporal_task_queue=require_env("TEMPORAL_TASK_QUEUE"),
    )
