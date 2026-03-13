from __future__ import annotations

from platformik_service_ai.tui.types import CommandContext


async def handle_quit_command(context: CommandContext, args: str) -> bool:
    del context, args
    return False
