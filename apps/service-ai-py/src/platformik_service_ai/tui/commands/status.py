from __future__ import annotations

from typing import cast

import typer

from platformik_service_ai.tui.client import describe_active_workflow, get_workflow_handle
from platformik_service_ai.tui.types import CommandContext


async def handle_status_command(context: CommandContext, args: str) -> bool:
    del args

    if not context.session.active:
        typer.echo("No active workflow. Use /start or /attach.")
        return True

    handle = get_workflow_handle(context.client, cast(str, context.session.workflow_id))
    is_active, context.session.seen_messages = await describe_active_workflow(
        handle,
        context.session.seen_messages,
    )
    if not is_active:
        context.session.workflow_id = None

    return True
