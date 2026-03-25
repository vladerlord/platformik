from __future__ import annotations

import typer

from platformik_service_ai.tui.commands.attach import handle_attach_command
from platformik_service_ai.tui.commands.help import handle_help_command
from platformik_service_ai.tui.commands.quit import handle_quit_command
from platformik_service_ai.tui.commands.start import handle_start_command
from platformik_service_ai.tui.commands.status import handle_status_command
from platformik_service_ai.tui.commands.workflows import handle_workflows_command
from platformik_service_ai.tui.types import CommandContext

COMMAND_HANDLERS = {
    "/attach": handle_attach_command,
    "/help": handle_help_command,
    "/quit": handle_quit_command,
    "/start": handle_start_command,
    "/status": handle_status_command,
    "/workflows": handle_workflows_command,
}


async def handle_slash_command(line: str, context: CommandContext) -> bool:
    command, _, args = line.partition(" ")
    handler = COMMAND_HANDLERS.get(command.lower())

    if handler is None:
        typer.echo("Unknown command. Use /help.")
        return True

    return await handler(context, args.strip())
