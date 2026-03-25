from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ChatSession:
    workflow_id: str | None = None
    seen_messages: int = 0

    @property
    def active(self) -> bool:
        return self.workflow_id is not None


@dataclass
class CommandContext:
    client: Any
    session: ChatSession
