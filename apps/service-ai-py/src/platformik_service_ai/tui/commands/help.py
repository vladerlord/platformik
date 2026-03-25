from __future__ import annotations

import typer

from platformik_service_ai.tui.types import CommandContext


def print_chat_help() -> None:
    typer.echo("/workflows - list available workflows")
    typer.echo("/start <flow_name> - start a named workflow (e.g. /start programming_language)")
    typer.echo("/attach <workflow_id> - attach to an existing flow")
    typer.echo("/status - show current workflow state")
    typer.echo("/quit - exit the chat")
    typer.echo("/help - show this help")
    typer.echo("Any input without '/' is sent as the answer to the active workflow.")


async def handle_help_command(context: CommandContext, args: str) -> bool:
    del context, args
    print_chat_help()
    return True
