from __future__ import annotations

import typer

from platformik_service_ai.tui.client import describe_active_workflow, get_workflow_handle
from platformik_service_ai.tui.types import CommandContext


async def handle_attach_command(context: CommandContext, args: str) -> bool:
    if not args:
        typer.echo("Usage: /attach <workflow_id>")
        return True

    handle = get_workflow_handle(context.client, args)
    context.session.workflow_id = args
    context.session.seen_messages = 0
    typer.echo(f"Attached to: {args}")
    is_active, context.session.seen_messages = await describe_active_workflow(
        handle,
        context.session.seen_messages,
    )
    if not is_active:
        context.session.workflow_id = None

    return True
